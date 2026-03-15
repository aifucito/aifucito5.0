import "dotenv/config";
import { Telegraf, Markup, session } from "telegraf";
import express from "express";
import compression from "compression";
import fs from "fs";
import path from "path";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";

/* ===============================
   CONFIGURACIÓN CENTRAL
   =============================== */
const ADMIN_ID = "7662736311"; 
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
bot.catch(err => log("BOT_ERROR", err.message));
bot.use(session());

/* ===============================
   UTILIDADES Y RANGOS
   =============================== */
const limpiar = t => t ? t.replace(/[^\p{L}\p{N}\s.,!?-]/gu, "") : "";

function distanciaKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function rangoUsuario(r) {
    if (r >= 50) return "🛰️ Investigador Élite";
    if (r >= 25) return "🔭 Investigador Senior";
    if (r >= 10) return "📡 Investigador";
    if (r >= 5) return "👁 Observador";
    return "👤 Testigo";
}

/* ===============================
   BASE DE DATOS (Persistencia Render)
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
    } catch { log("DB_ERR", "Error en el guardado."); }
}
setInterval(guardarDB, 30000);

/* ===============================
   ALGORITMOS DE DETECCIÓN
   =============================== */
function detectarOleada(rep) {
    const radio = 40, tiempo = 20 * 60 * 1000, ahora = Date.now();
    const cercanos = DB_REPORTES.filter(r => ahora - r.ts < tiempo && distanciaKm(r.lat, r.lon, rep.lat, rep.lon) < radio);
    return cercanos.length >= 3;
}

/* ===============================
   TECLADO E INTERFAZ
   =============================== */
const teclado = Markup.keyboard([
    ["🛸 GENERAR REPORTE", Markup.button.webApp("🌍 VER RADAR", WEBAPP_URL)],
    ["⭐ MI PERFIL", "📊 ESTADÍSTICAS"],
    ["🧉 MATE INVESTIGADOR"]
]).resize();

bot.start(ctx => {
    const id = ctx.from.id.toString();
    if (!DB_AGENTES[id]) DB_AGENTES[id] = { nombre: ctx.from.first_name, reportes: 0, vip: false };
    ctx.reply(`🛸 ¡BIENVENIDO A AIFU!\n\nLa red de observadores está activa.`, teclado);
});

/* ===============================
   FLUJO DE REPORTES
   =============================== */
bot.hears("🛸 GENERAR REPORTE", ctx => {
    ctx.session.reporte = { id: uuidv4(), ts: Date.now() };
    ctx.reply("📍 Enviá tu ubicación GPS.", Markup.keyboard([[Markup.button.locationRequest("📍 ENVIAR GPS")], ["❌ CANCELAR"]]).resize());
});

bot.on("location", async ctx => {
    if (!ctx.session?.reporte) return;
    const r = ctx.session.reporte;
    const { latitude, longitude } = ctx.message.location;
    r.lat = latitude; r.lon = longitude; r.idUser = ctx.from.id.toString();

    try {
        const res = await axios.get("https://nominatim.openstreetmap.org/reverse", { params: { lat: latitude, lon: longitude, format: "json" }, headers: { "User-Agent": "AIFU" } });
        const addr = res.data.address || {};
        r.ciudad = addr.city || addr.town || addr.village || "Zona rural";
        r.pais = addr.country || "Desconocido";
    } catch { r.ciudad = "Zona GPS"; r.pais = "Desconocido"; }

    const p = (r.pais || "").toLowerCase();
    r.destinoPaisId = p.includes("uruguay") ? GRUPOS.URUGUAY : p.includes("argentina") ? GRUPOS.ARGENTINA : p.includes("chile") ? GRUPOS.CHILE : GRUPOS.GLOBAL;

    ctx.session.esperandoDesc = true;
    ctx.reply(`📍 ${r.ciudad}\n\n¿Qué estás viendo? Contame los detalles:`);
});

bot.on("text", async (ctx, next) => {
    if (ctx.message.text === "❌ CANCELAR") { ctx.session = null; return ctx.reply("Abortado.", teclado); }
    if (!ctx.session?.esperandoDesc) return next();
    
    ctx.session.reporte.descripcion = limpiar(ctx.message.text).slice(0, 400);
    ctx.session.esperandoDesc = false;

    // Solo ADMIN o VIP mandan multimedia
    if (ctx.from.id.toString() === ADMIN_ID || DB_AGENTES[ctx.from.id.toString()]?.vip) {
        ctx.session.esperandoMultimedia = true;
        return ctx.reply("📸 ¿Tenés evidencia?", Markup.inlineKeyboard([[Markup.button.callback("📸 SÍ", "ev_si"), Markup.button.callback("FINALIZAR", "finalizar")]]));
    }
    await enviarFinal(ctx);
});

bot.action("ev_si", ctx => { ctx.answerCbQuery(); ctx.reply("Subí la foto o video."); });
bot.action("finalizar", async ctx => { ctx.answerCbQuery(); await enviarFinal(ctx); });

bot.on(["photo", "video"], async ctx => {
    if (!ctx.session?.esperandoMultimedia) return;
    const r = ctx.session.reporte;
    r.fileId = ctx.message.photo ? ctx.message.photo.at(-1).file_id : ctx.message.video.file_id;
    r.msgType = ctx.message.photo ? "photo" : "video";
    await enviarFinal(ctx);
});

async function enviarFinal(ctx) {
    if (!ctx.session?.reporte || ctx.session.reporte.enviado) return;
    const r = ctx.session.reporte; r.enviado = true;
    
    DB_REPORTES.push(r);
    if (DB_AGENTES[r.idUser]) DB_AGENTES[r.idUser].reportes++;
    guardarDB();

    if (detectarOleada(r)) bot.telegram.sendMessage(RADAR_CONO_SUR, `🚨 OLEADA DETECTADA EN ${r.ciudad.toUpperCase()}`);

    const txt = `🛸 REPORTE AIFU\n📍 ${r.ciudad}, ${r.pais}\n👤 ${ctx.from.first_name}\n📝 ${r.descripcion}`;
    
    try {
        if (r.fileId) {
            if (r.msgType === "photo") await bot.telegram.sendPhoto(RADAR_CONO_SUR, r.fileId, { caption: txt });
            else await bot.telegram.sendVideo(RADAR_CONO_SUR, r.fileId, { caption: txt });
        } else { 
            await bot.telegram.sendMessage(RADAR_CONO_SUR, txt); 
        }
        await bot.telegram.sendMessage(r.destinoPaisId, txt);
    } catch (e) { log("ERR_SEND", e.message); }

    ctx.reply("🚀 Reporte enviado al radar y grupos regionales.", teclado);
    ctx.session = null;
}

/* ===============================
   COMANDOS ADMIN Y VIP
   =============================== */
bot.command("vip", (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const targetId = ctx.message.text.split(" ")[1];
    if (DB_AGENTES[targetId]) {
        DB_AGENTES[targetId].vip = true;
        guardarDB();
        ctx.reply(`✅ ID ${targetId} ahora es VIP.`);
        bot.telegram.sendMessage(targetId, "⭐ ¡Has sido ascendido a Investigador VIP!");
    }
});

bot.hears("⭐ MI PERFIL", ctx => {
    const u = DB_AGENTES[ctx.from.id.toString()] || { reportes: 0, vip: false };
    ctx.reply(`🪪 **EXPEDIENTE**\n\n🆔 ID: \`${ctx.from.id}\`\n🛸 Reportes: ${u.reportes}\n🎖️ Rango: ${rangoUsuario(u.reportes)}\n${u.vip ? "⭐ VIP" : "👁️ OBSERVADOR"}`);
});

bot.hears("📊 ESTADÍSTICAS", ctx => {
    const hoy = new Date().setHours(0,0,0,0);
    const reportesHoy = DB_REPORTES.filter(r => r.ts > hoy).length;
    ctx.reply(`📊 **ESTADO**\n\n🛸 Hoy: ${reportesHoy}\n📈 Total: ${DB_REPORTES.length}`);
});

bot.hears("🧉 MATE INVESTIGADOR", ctx => ctx.reply("🍃 Vigilancia nocturna activada. Termo y Baldo a mano."));

/* ===============================
   API WEB (PARA EL RADAR)
   =============================== */
const app = express();
app.use(compression());
app.use(express.static("public"));

app.get("/radar-data", (req, res) => {
    res.json(DB_REPORTES.slice(-200).map(r => ({
        lat: r.lat,
        lon: r.lon,
        desc: r.descripcion?.slice(0, 80),
        agente: DB_AGENTES[r.idUser]?.nombre || "Anon",
        vip: DB_AGENTES[r.idUser]?.vip || false
    })));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => log("WEB", "Radar API activa"));

bot.launch().then(() => log("BOT", "AIFU OPERATIVO 📡"));
