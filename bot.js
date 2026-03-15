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
const ADMIN_ID = "7662736311"; // DAMIÁN
const RADAR_CONO_SUR = "-1002447915570";
const WEBAPP_URL = "https://aifucito5-0.onrender.com"; 

const GRUPOS = {
    URUGUAY: "-1002341505345",
    ARGENTINA: "-1002319047243",
    CHILE: "-1002334825945",
    GLOBAL: "-4740280144"
};

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const log = (t, m) => console.log(`[${new Date().toISOString()}] ${t}: ${m}`);
bot.use(session());

/* ===============================
   PERSISTENCIA DE DATOS
   =============================== */
const DATA_DIR = "/opt/render/project/src/data"; 
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const AGENTES_PATH = path.join(DATA_DIR, "agentes.json");
const REPORTES_PATH = path.join(DATA_DIR, "reportes.json");

let DB_AGENTES = {}, DB_REPORTES = [];

function cargarDB() {
    try {
        if (fs.existsSync(AGENTES_PATH)) DB_AGENTES = JSON.parse(fs.readFileSync(AGENTES_PATH));
        if (fs.existsSync(REPORTES_PATH)) DB_REPORTES = JSON.parse(fs.readFileSync(REPORTES_PATH));
    } catch { log("DB", "Bases de datos inicializadas."); }
}
cargarDB();

function guardarDB() {
    try {
        fs.writeFileSync(AGENTES_PATH, JSON.stringify(DB_AGENTES));
        fs.writeFileSync(REPORTES_PATH, JSON.stringify(DB_REPORTES));
    } catch { log("DB_ERR", "Error al guardar."); }
}
setInterval(guardarDB, 30000);

/* ===============================
   LÓGICA DE OLEADAS Y RANGOS
   =============================== */
function obtenerRango(id, r) {
    if (id.toString() === ADMIN_ID) return "💎 PRESIDENTE AIFU";
    if (r >= 50) return "🛰️ Investigador Élite";
    if (r >= 25) return "🔭 Investigador Senior";
    if (r >= 10) return "📡 Investigador";
    if (r >= 5) return "👁 Observador";
    return "👤 Testigo";
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
   INTERFAZ PRINCIPAL
   =============================== */
const teclado = Markup.keyboard([
    ["🛸 GENERAR REPORTE", Markup.button.webApp("🌍 VER RADAR", WEBAPP_URL)],
    ["⭐ MI PERFIL", "📊 ESTADÍSTICAS"],
    ["💳 AFILIACIÓN / PAGO", "🧉 MATE INVESTIGADOR"]
]).resize();

bot.start(ctx => {
    const id = ctx.from.id.toString();
    if (!DB_AGENTES[id]) {
        DB_AGENTES[id] = { nombre: ctx.from.first_name, reportes: 0, vip: (id === ADMIN_ID) };
    } else if (id === ADMIN_ID) {
        DB_AGENTES[id].vip = true;
    }
    guardarDB();
    const saludo = (id === ADMIN_ID) 
        ? `🫡 ¡A SUS ÓRDENES PRESIDENTE DAMIÁN!\n\nEl sistema AIFUCITO 5.0 está operativo y sincronizado con el Radar Cono Sur.`
        : `🛸 ¡BIENVENIDO AGENTE!\n\nIniciando escaneo de frecuencia para la red AIFU.`;
    ctx.reply(saludo, teclado);
});

/* ===============================
   GESTIÓN DE REPORTES (MULTIMEDIA + GPS)
   =============================== */
bot.hears("🛸 GENERAR REPORTE", ctx => {
    ctx.session.reporte = { id: uuidv4(), ts: Date.now(), idUser: ctx.from.id.toString() };
    ctx.reply("📍 Para iniciar el reporte, necesito tu ubicación GPS.", 
        Markup.keyboard([[Markup.button.locationRequest("📍 ENVIAR MI UBICACIÓN")], ["❌ CANCELAR"]]).resize());
});

bot.on("location", async ctx => {
    if (!ctx.session?.reporte) return;
    const r = ctx.session.reporte;
    r.lat = ctx.message.location.latitude;
    r.lon = ctx.message.location.longitude;

    try {
        const res = await axios.get("https://nominatim.openstreetmap.org/reverse", { 
            params: { lat: r.lat, lon: r.lon, format: "json" }, 
            headers: { "User-Agent": "AIFU-Radar" } 
        });
        r.ciudad = res.data.address.city || res.data.address.town || "Zona Rural";
        r.pais = res.data.address.country || "Desconocido";
    } catch { r.ciudad = "Coordenadas GPS"; r.pais = "Desconocido"; }

    ctx.session.esperandoDesc = true;
    ctx.reply(`📍 Ubicación: ${r.ciudad}\n\n¿Qué estás observando? Describí el fenómeno:`);
});

bot.on("text", async (ctx, next) => {
    if (ctx.message.text === "❌ CANCELAR") { ctx.session = null; return ctx.reply("Acción cancelada.", teclado); }
    if (!ctx.session?.esperandoDesc) return next();
    
    const r = ctx.session.reporte;
    r.descripcion = ctx.message.text;
    ctx.session.esperandoDesc = false;

    // Solo ADMIN o VIP mandan multimedia
    if (ctx.from.id.toString() === ADMIN_ID || DB_AGENTES[ctx.from.id.toString()]?.vip) {
        ctx.session.esperandoMultimedia = true;
        return ctx.reply("📸 **EVIDENCIA.**\nPodés enviar una foto o video del avistamiento:", 
            Markup.inlineKeyboard([[Markup.button.callback("FINALIZAR SIN ARCHIVO", "finalizar")]]));
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

bot.action("finalizar", async ctx => {
    ctx.answerCbQuery();
    await finalizarReporte(ctx);
});

async function finalizarReporte(ctx) {
    if (!ctx.session?.reporte || ctx.session.reporte.enviado) return;
    const r = ctx.session.reporte; r.enviado = true;
    
    DB_REPORTES.push(r);
    DB_AGENTES[r.idUser].reportes++;
    guardarDB();

    if (detectarOleada(r)) bot.telegram.sendMessage(RADAR_CONO_SUR, `🚨 **ALERTA DE OLEADA** en ${r.ciudad.toUpperCase()}!`);

    const txt = `🛸 **NUEVO REPORTE AIFU**\n📍 ${r.ciudad}, ${r.pais}\n👤 ${ctx.from.first_name}\n🎖️ ${obtenerRango(r.idUser, DB_AGENTES[r.idUser].reportes)}\n📝 ${r.descripcion}`;
    
    // Envío General
    if (r.fileId) {
        if (r.msgType === "photo") await bot.telegram.sendPhoto(RADAR_CONO_SUR, r.fileId, { caption: txt });
        else await bot.telegram.sendVideo(RADAR_CONO_SUR, r.fileId, { caption: txt });
    } else {
        await bot.telegram.sendMessage(RADAR_CONO_SUR, txt);
    }
    
    // Envío Regional
    const p = r.pais.toLowerCase();
    const dest = p.includes("uruguay") ? GRUPOS.URUGUAY : p.includes("argentina") ? GRUPOS.ARGENTINA : p.includes("chile") ? GRUPOS.CHILE : GRUPOS.GLOBAL;
    bot.telegram.sendMessage(dest, txt).catch(() => log("DIFUSION", "Grupo no alcanzado"));

    ctx.reply("🚀 ¡Reporte enviado con éxito!", teclado);
    ctx.session = null;
}

/* ===============================
   BOTONES SECUNDARIOS
   =============================== */
bot.hears("🧉 MATE INVESTIGADOR", ctx => {
    ctx.reply("🍃 Vigilancia nocturna activa.\nTermo Stanley cargado, Yerba Baldo lista y ojos en el cielo.\n\n¡Buena jornada de observación, Agente!");
});

bot.hears("⭐ MI PERFIL", ctx => {
    const id = ctx.from.id.toString();
    const u = DB_AGENTES[id] || { reportes: 0, vip: false };
    ctx.reply(`🪪 **EXPEDIENTE AIFU**\n\n👤 Agente: ${ctx.from.first_name}\n🆔 ID: \`${id}\`\n🛸 Reportes: ${u.reportes}\n🎖️ Rango: ${obtenerRango(id, u.reportes)}\n${u.vip ? "⭐ ESTADO: VIP (Multimedia habilitada)" : "👁️ ESTADO: OBSERVADOR"}`);
});

bot.hears("📊 ESTADÍSTICAS", ctx => {
    ctx.reply(`📊 **RADAR ESTADÍSTICO**\n\n🛸 Total histórico: ${DB_REPORTES.length}\n📡 Red de Agentes: ${Object.keys(DB_AGENTES).length}`);
});

bot.hears("💳 AFILIACIÓN / PAGO", ctx => {
    ctx.reply("💳 **MEMBRESÍA AIFU**\n\nApoyá la investigación oficial. Membresía por $1.50 USD.\n\n🔗 [PAGAR AQUÍ](https://link-de-tu-pago.com)");
});

/* ===============================
   SERVIDOR WEB
   =============================== */
const app = express();
app.use(compression());
app.use(express.static("public"));
app.get("/radar-data", (req, res) => {
    res.json(DB_REPORTES.slice(-100).map(r => ({
        lat: r.lat, lon: r.lon,
        vip: DB_AGENTES[r.idUser]?.vip || false,
        agente: DB_AGENTES[r.idUser]?.nombre || "Anon",
        desc: r.descripcion
    })));
});

app.listen(process.env.PORT || 10000);
bot.launch();
