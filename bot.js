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
const ADMIN_ID = "7662736311"; // ID de Damián
const RADAR_CONO_SUR = "-1002447915570";
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

let spamControl = [];
function antiSpamGlobal() {
    const now = Date.now();
    spamControl = spamControl.filter(t => now - t < 60000);
    spamControl.push(now);
    return spamControl.length < 40;
}

/* ===============================
   BASE DE DATOS (Ruta Persistente Render)
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
        const t1 = AGENTES_PATH + ".tmp", t2 = REPORTES_PATH + ".tmp";
        fs.writeFileSync(t1, JSON.stringify(DB_AGENTES));
        fs.writeFileSync(t2, JSON.stringify(DB_REPORTES));
        fs.renameSync(t1, AGENTES_PATH); fs.renameSync(t2, REPORTES_PATH);
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

function detectarEventoClaseA(rep) {
    const radio = 15, tiempo = 10 * 60 * 1000, ahora = Date.now();
    const cercanos = DB_REPORTES.filter(r => r.idUser !== rep.idUser && ahora - r.ts < tiempo && distanciaKm(r.lat, r.lon, rep.lat, rep.lon) < radio);
    return cercanos.length >= 2;
}

/* ===============================
   FLUJO DE REPORTES E INTERFAZ
   =============================== */
const teclado = Markup.keyboard([
    ["🛸 GENERAR REPORTE", "🌍 VER RADAR"],
    ["⭐ MI PERFIL", "📊 ESTADÍSTICAS"],
    ["🧉 MATE INVESTIGADOR"]
]).resize();

bot.start(ctx => {
    const id = ctx.from.id;
    if (!DB_AGENTES[id]) DB_AGENTES[id] = { nombre: ctx.from.first_name, reportes: 0, historial: [], vip: false };
    ctx.reply(`🛸 ¡BIENVENIDO A AIFU!\n\nLa red de observadores está activa. CRIDOVNI vigila el cielo, nosotros también.`, teclado);
});

bot.hears("🛸 GENERAR REPORTE", ctx => {
    if (!antiSpamGlobal()) return ctx.reply("⚠️ Señal saturada. Esperá un momento.");
    const ahora = Date.now();
    ctx.session.reporte = { id: uuidv4(), ts: ahora, expira: ahora + 300000 };
    ctx.reply("📍 Enviá tu ubicación GPS para el radar.", Markup.keyboard([[Markup.button.locationRequest("📍 ENVIAR GPS")], ["❌ CANCELAR"]]).resize());
});

bot.on("location", async ctx => {
    if (!ctx.session?.reporte) return;
    const r = ctx.session.reporte;
    const { latitude, longitude } = ctx.message.location;
    r.lat = latitude; r.lon = longitude; r.idUser = ctx.from.id;

    ctx.reply("🔍 Analizando coordenadas...");
    try {
        const res = await axios.get("https://nominatim.openstreetmap.org/reverse", { params: { lat: latitude, lon: longitude, format: "json" }, headers: { "User-Agent": "AIFU" } });
        const addr = res.data.address || {};
        r.ciudad = addr.city || addr.town || addr.village || "Zona rural";
        r.pais = addr.country || "Desconocido";
    } catch { r.ciudad = "Zona GPS"; r.pais = "Desconocido"; }

    const p = (r.pais || "").toLowerCase();
    r.destinoPaisId = p.includes("uruguay") ? GRUPOS.URUGUAY : p.includes("argentina") ? GRUPOS.ARGENTINA : p.includes("chile") ? GRUPOS.CHILE : GRUPOS.GLOBAL;

    ctx.session.esperandoDesc = true;
    ctx.reply(`📍 ${r.ciudad}\n\n¿DNI? ¡OVNI! Contame qué estás viendo ahora:`);
});

bot.on("text", async (ctx, next) => {
    if (ctx.message.text === "❌ CANCELAR") { ctx.session = null; return ctx.reply("Reporte abortado.", teclado); }
    if (!ctx.session?.esperandoDesc) return next();
    ctx.session.reporte.descripcion = limpiar(ctx.message.text).slice(0, 400);
    ctx.session.esperandoDesc = false;

    // Solo ADMIN o VIP pueden mandar multimedia
    if (ctx.from.id.toString() === ADMIN_ID || DB_AGENTES[ctx.from.id]?.vip) {
        ctx.session.esperandoMultimedia = true;
        return ctx.reply("📸 ¿Tenés evidencia visual?", Markup.inlineKeyboard([[Markup.button.callback("📸 SÍ", "ev_si"), Markup.button.callback("FINALIZAR", "finalizar")]]));
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
    DB_AGENTES[r.idUser].reportes++;
    guardarDB();

    if (detectarOleada(r)) bot.telegram.sendMessage(RADAR_CONO_SUR, `🚨 OLEADA EN ${r.ciudad.toUpperCase()}`);
    if (detectarEventoClaseA(r)) bot.telegram.sendMessage(RADAR_CONO_SUR, `🛸 EVENTO CLASE A (Múltiples testigos) en ${r.ciudad}`);

    const txt = `🛸 REPORTE AIFU\n📍 ${r.ciudad}, ${r.pais}\n👤 ${ctx.from.first_name}\n📝 ${r.descripcion}`;
    try {
        if (r.fileId) {
            if (r.msgType === "photo") await bot.telegram.sendPhoto(RADAR_CONO_SUR, r.fileId, { caption: txt });
            else await bot.telegram.sendVideo(RADAR_CONO_SUR, r.fileId, { caption: txt });
        } else { await bot.telegram.sendMessage(RADAR_CONO_SUR, txt); }
        await bot.telegram.sendMessage(r.destinoPaisId, txt);
    } catch (e) { log("ERR_SEND", e.message); }

    ctx.reply("🚀 Reporte enviado. ¡Buen laburo Agente!", teclado);
    ctx.session = null;
}

/* ===============================
   COMANDOS DE ADMINISTRACIÓN VIP
   =============================== */

// Uso: /vip ID_DEL_USUARIO
bot.command("vip", (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return ctx.reply("❌ Acceso denegado.");
    const args = ctx.message.text.split(" ");
    if (args.length !== 2) return ctx.reply("⚠️ Usá: /vip ID");
    const targetId = args[1];
    if (!DB_AGENTES[targetId]) return ctx.reply("❌ Usuario no encontrado.");
    
    DB_AGENTES[targetId].vip = true;
    guardarDB();
    ctx.reply(`✅ ${DB_AGENTES[targetId].nombre} ahora es VIP.`);
    bot.telegram.sendMessage(targetId, "⭐ ¡Atención! Has sido ascendido a Investigador VIP. Ahora podés enviar fotos y videos.");
});

// Uso: /unvip ID_DEL_USUARIO
bot.command("unvip", (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return ctx.reply("❌ Acceso denegado.");
    const args = ctx.message.text.split(" ");
    const targetId = args[1];
    if (DB_AGENTES[targetId]) {
        DB_AGENTES[targetId].vip = false;
        guardarDB();
        ctx.reply(`🚫 VIP revocado para ${DB_AGENTES[targetId].nombre}.`);
    }
});

/* ===============================
   BOTONES SECUNDARIOS
   =============================== */

bot.hears("⭐ MI PERFIL", ctx => {
    const u = DB_AGENTES[ctx.from.id] || { reportes: 0, vip: false };
    ctx.reply(`🪪 **EXPEDIENTE DE AGENTE**\n\n🆔 Mi ID: \`${ctx.from.id}\`\n👤 Nombre: ${ctx.from.first_name}\n🛸 Reportes: ${u.reportes}\n🎖️ Rango: ${rangoUsuario(u.reportes)}\n${u.vip ? "⭐ ESTADO: INVESTIGADOR VIP" : "👁️ ESTADO: OBSERVADOR"}`);
});

bot.hears("📊 ESTADÍSTICAS", ctx => {
    const hoy = new Date().setHours(0,0,0,0);
    const reportesHoy = DB_REPORTES.filter(r => r.ts > hoy).length;
    ctx.reply(`📊 **ACTIVIDAD DEL DÍA**\n\n🛸 Reportes hoy: ${reportesHoy}\n📈 Total en base de datos: ${DB_REPORTES.length}`);
});

bot.hears("🧉 MATE INVESTIGADOR", ctx => ctx.reply("🍃 Vigilancia nocturna activada. Ojos en el cielo y termo bajo el brazo."));

/* ===============================
   RADAR WEB Y ARRANQUE
   =============================== */
const app = express();
app.use(compression());
app.use(express.static("public"));
app.get("/radar-data", (req, res) => {
    res.json(DB_REPORTES.slice(-200).map(r => ({ lat: r.lat, lon: r.lon, desc: r.descripcion?.slice(0, 80), ts: r.ts })));
});
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => log("WEB", "Radar activo"));

bot.launch().then(() => log("BOT", "AIFU OPERATIVO 📡"));

process.once("SIGINT", () => { guardarDB(); bot.stop("SIGINT"); });
process.once("SIGTERM", () => { guardarDB(); bot.stop("SIGTERM"); });
