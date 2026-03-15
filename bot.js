import "dotenv/config";
import { Telegraf, Markup, session } from "telegraf";
import express from "express";
import compression from "compression";
import fs from "fs";
import path from "path";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";

/* ===============================
   CONFIGURACIÓN CENTRAL AIFU
   =============================== */
const ADMIN_ID = "7662736311"; // ID DAMIÁN
const RADAR_CONO_SUR = "-1002447915570";
const WEBAPP_URL = "https://aifucito5-0.onrender.com"; 

const GRUPOS = {
    URUGUAY: "-1002341505345",
    ARGENTINA: "-1002319047243",
    CHILE: "-1002334825945",
    GLOBAL: "-4740280144"
};

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
bot.use(session());

/* ===============================
   PERSISTENCIA DE DATOS
   =============================== */
const DATA_DIR = path.join(process.cwd(), "data"); 
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const AGENTES_PATH = path.join(DATA_DIR, "agentes.json");
const REPORTES_PATH = path.join(DATA_DIR, "reportes.json");

let DB_AGENTES = {}, DB_REPORTES = [];

function cargarDB() {
    try {
        if (fs.existsSync(AGENTES_PATH)) DB_AGENTES = JSON.parse(fs.readFileSync(AGENTES_PATH, "utf-8"));
        if (fs.existsSync(REPORTES_PATH)) DB_REPORTES = JSON.parse(fs.readFileSync(REPORTES_PATH, "utf-8"));
        
        // PUNTOS INICIALES PARA QUE EL RADAR TENGA SEÑAL SIEMPRE
        if (DB_REPORTES.length === 0) {
            DB_REPORTES = [
                { id: "p1", lat: -34.912, lon: -55.045, descripcion: "Vigilia Base AIFU - Punta Ballena", idUser: ADMIN_ID, ts: Date.now(), ciudad: "Punta Ballena" },
                { id: "p2", lat: -34.862, lon: -55.275, descripcion: "Vigilia Base AIFU - Piriápolis", idUser: ADMIN_ID, ts: Date.now(), ciudad: "Piriápolis" }
            ];
            guardarDB();
        }
    } catch (e) { console.log("⚠️ Iniciando bases de datos..."); }
}

function guardarDB() {
    try {
        fs.writeFileSync(AGENTES_PATH, JSON.stringify(DB_AGENTES, null, 2));
        fs.writeFileSync(REPORTES_PATH, JSON.stringify(DB_REPORTES, null, 2));
    } catch (e) { console.error("❌ Error al guardar datos"); }
}

cargarDB();
setInterval(guardarDB, 30000);

/* ===============================
   LÓGICA TÁCTICA
   =============================== */
function obtenerRango(id, r) {
    if (id.toString() === ADMIN_ID) return "💎 PRESIDENTE AIFU";
    if (r >= 50) return "🛰️ Investigador Élite";
    if (r >= 10) return "📡 Investigador";
    return "👁️ Observador";
}

function distanciaKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function detectarOleada(rep) {
    const radio = 40, tiempo = 20 * 60 * 1000, ahora = Date.now();
    const cercanos = DB_REPORTES.filter(r => ahora - r.ts < tiempo && distanciaKm(r.lat, r.lon, rep.lat, rep.lon) < radio);
    return cercanos.length >= 3;
}

/* ===============================
   INTERFAZ (TECLADO DAMIÁN)
   =============================== */
const teclado = Markup.keyboard([
    ["🛸 GENERAR REPORTE", Markup.button.webApp("🌍 VER RADAR", WEBAPP_URL)],
    ["⭐ MI PERFIL", "📊 ESTADÍSTICAS"],
    ["💳 AFILIACIÓN / PAGO", "🧉 MATE INVESTIGADOR"]
]).resize();

bot.start(ctx => {
    const id = ctx.from.id.toString();
    if (!DB_AGENTES[id]) DB_AGENTES[id] = { nombre: ctx.from.first_name, reportes: 0, vip: (id === ADMIN_ID) };
    if (id === ADMIN_ID) DB_AGENTES[id].vip = true;
    guardarDB();
    ctx.reply(`🫡 ¡SISTEMA AIFU ONLINE!\n\nBienvenido Presidente Damián. El Radar Cono Sur está sincronizado y esperando reportes.`, teclado);
});

/* ===============================
   FLUJO DE REPORTE COMPLETO
   =============================== */
bot.hears("🛸 GENERAR REPORTE", ctx => {
    ctx.session.reporte = { id: uuidv4(), ts: Date.now(), idUser: ctx.from.id.toString() };
    ctx.reply("📍 Para el mapa táctico, necesito tu ubicación GPS.", 
        Markup.keyboard([[Markup.button.locationRequest("📍 ENVIAR UBICACIÓN")], ["❌ CANCELAR"]]).resize());
});

bot.on("location", async ctx => {
    if (!ctx.session?.reporte) return;
    const r = ctx.session.reporte;
    r.lat = ctx.message.location.latitude;
    r.lon = ctx.message.location.longitude;

    try {
        const res = await axios.get("https://nominatim.openstreetmap.org/reverse", { 
            params: { lat: r.lat, lon: r.lon, format: "json" }, 
            headers: { "User-Agent": "AIFU-Bot" } 
        });
        r.ciudad = res.data.address.city || res.data.address.town || "Zona Rural";
        r.pais = res.data.address.country || "Desconocido";
    } catch { r.ciudad = "Coordenadas GPS"; r.pais = "Desconocido"; }

    ctx.session.esperandoDesc = true;
    ctx.reply(`📍 Zona: ${r.ciudad}\n\n¿Qué estás viendo? Describí el fenómeno (luces, forma, dirección):`);
});

bot.on("text", async (ctx, next) => {
    if (ctx.message.text === "❌ CANCELAR") { ctx.session = null; return ctx.reply("Acción cancelada.", teclado); }
    if (!ctx.session?.esperandoDesc) return next();
    
    const r = ctx.session.reporte;
    r.descripcion = ctx.message.text;
    ctx.session.esperandoDesc = false;

    // Solo VIP o ADMIN (Damián) pueden mandar fotos/videos
    if (ctx.from.id.toString() === ADMIN_ID || DB_AGENTES[ctx.from.id.toString()]?.vip) {
        ctx.session.esperandoMultimedia = true;
        return ctx.reply("📸 **EVIDENCIA VISUAL**\nPodés enviar una foto o video ahora, o finalizar el reporte:", 
            Markup.inlineKeyboard([[Markup.button.callback("✅ FINALIZAR SIN ARCHIVO", "finalizar")]]));
    }
    await finalizarReporte(ctx);
});

bot.on(["photo", "video"], async ctx => {
    if (!ctx.session?.esperandoMultimedia) return;
    const r = ctx.session.reporte;
    r.fileId = ctx.message.photo ? ctx.message.photo.at(-1).file_id : ctx.message.video.file_id;
    r.msgType = ctx.message.photo ? "photo" : "video";
    await finalizarReporte(ctx);
});

bot.action("finalizar", async ctx => { ctx.answerCbQuery(); await finalizarReporte(ctx); });

async function finalizarReporte(ctx) {
    if (!ctx.session?.reporte || ctx.session.reporte.enviado) return;
    const r = ctx.session.reporte; r.enviado = true;
    
    DB_REPORTES.push(r);
    DB_AGENTES[r.idUser].reportes++;
    guardarDB();

    // Detección de oleada
    if (detectarOleada(r)) bot.telegram.sendMessage(RADAR_CONO_SUR, `🚨 **ALERTA DE OLEADA** en ${r.ciudad.toUpperCase()}!`);

    const txt = `🛸 **REPORTE AIFU**\n📍 ${r.ciudad}, ${r.pais}\n👤 ${ctx.from.first_name}\n🎖️ ${obtenerRango(r.idUser, DB_AGENTES[r.idUser].reportes)}\n📝 ${r.descripcion}`;
    
    // Envío a canal principal con multimedia si existe
    if (r.fileId) {
        if (r.msgType === "photo") await bot.telegram.sendPhoto(RADAR_CONO_SUR, r.fileId, { caption: txt });
        else await bot.telegram.sendVideo(RADAR_CONO_SUR, r.fileId, { caption: txt });
    } else {
        await bot.telegram.sendMessage(RADAR_CONO_SUR, txt);
    }
    
    // Envío a grupos regionales
    const p = r.pais ? r.pais.toLowerCase() : "";
    const dest = p.includes("uruguay") ? GRUPOS.URUGUAY : p.includes("argentina") ? GRUPOS.ARGENTINA : p.includes("chile") ? GRUPOS.CHILE : GRUPOS.GLOBAL;
    bot.telegram.sendMessage(dest, txt).catch(() => {});

    ctx.reply("🚀 ¡Reporte enviado y registrado en el Radar!", teclado);
    ctx.session = null;
}

/* ===============================
   BOTONES ADICIONALES
   =============================== */
bot.hears("🧉 MATE INVESTIGADOR", ctx => ctx.reply("🍃 Vigilancia activa.\nStanley cargado, Yerba Baldo y ojos al cielo."));
bot.hears("⭐ MI PERFIL", ctx => {
    const id = ctx.from.id.toString();
    const u = DB_AGENTES[id] || { reportes: 0, vip: false };
    ctx.reply(`🪪 **EXPEDIENTE AIFU**\n👤 Agente: ${u.nombre}\n🛸 Reportes: ${u.reportes}\n🎖️ Rango: ${obtenerRango(id, u.reportes)}`);
});
bot.hears("📊 ESTADÍSTICAS", ctx => ctx.reply(`📊 **RADAR DATA**\n🛸 Reportes totales: ${DB_REPORTES.length}\n📡 Agentes en red: ${Object.keys(DB_AGENTES).length}`));
bot.hears("💳 AFILIACIÓN / PAGO", ctx => ctx.reply("💳 **APOYÁ A AIFU**\nMembresía vitalicia por $1.50 USD.\n[PAGAR AQUÍ](https://link-de-tu-pago.com)"));

/* ===============================
   SERVIDOR WEB (LA LLAVE DEL MAPA)
   =============================== */
const app = express();
app.use(compression());
app.use(express.static("public"));

app.get("/radar-data", (req, res) => {
    // ESTA ES LA FUNCIÓN QUE CORRIGE EL MAPA
    const datosMapa = DB_REPORTES.slice(-100).map(r => ({
        lat: parseFloat(r.lat),
        lon: parseFloat(r.lon),
        agente: DB_AGENTES[r.idUser]?.nombre || "Agente AIFU",
        desc: r.descripcion || "Sin descripción"
    }));
    res.json(datosMapa);
});

app.listen(process.env.PORT || 10000, () => console.log("🛰️ Radar Web Online"));
bot.launch();
