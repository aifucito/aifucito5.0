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
const ADMIN_ID = "7662736311"; // ID Único de Damián
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
   PERSISTENCIA (RENDERING DATA)
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
    } catch { console.log("[AIFU] Sistemas cargados."); }
}
cargarDB();

function guardarDB() {
    try {
        fs.writeFileSync(AGENTES_PATH, JSON.stringify(DB_AGENTES));
        fs.writeFileSync(REPORTES_PATH, JSON.stringify(DB_REPORTES));
    } catch { console.log("[AIFU] Datos sincronizados."); }
}
setInterval(guardarDB, 30000);

/* ===============================
   JERARQUÍA Y RANGOS AIFU
   =============================== */
function obtenerRango(id, r) {
    if (id.toString() === ADMIN_ID) return "💎 PRESIDENTE AIFU";
    if (r >= 50) return "🛰️ Investigador Élite";
    if (r >= 25) return "🔭 Investigador Senior";
    if (r >= 10) return "📡 Investigador";
    if (r >= 5) return "👁 Observador";
    return "👤 Testigo";
}

const teclado = Markup.keyboard([
    ["🛸 GENERAR REPORTE", Markup.button.webApp("🌍 VER RADAR", WEBAPP_URL)],
    ["⭐ MI PERFIL", "📊 ESTADÍSTICAS"],
    ["💳 AFILIACIÓN / PAGO", "🧉 MATE INVESTIGADOR"]
]).resize();

/* ===============================
   PROTOCOLO DE RESPUESTA
   =============================== */
bot.start(ctx => {
    const id = ctx.from.id.toString();
    if (!DB_AGENTES[id]) DB_AGENTES[id] = { nombre: ctx.from.first_name, reportes: 0, vip: (id === ADMIN_ID) };
    
    const saludo = (id === ADMIN_ID) 
        ? `🫡 **A SUS ÓRDENES, PRESIDENTE DAMIÁN.**\nEl Radar Cono Sur está activo y la comunidad de TikTok espera órdenes.` 
        : `🛸 **SISTEMA AIFU OPERATIVO.**\nBienvenido Agente. Estamos vigilando el cielo uruguayo y la región.`;
    
    ctx.reply(saludo, teclado);
});

bot.hears("🛸 GENERAR REPORTE", ctx => {
    ctx.session.reporte = { id: uuidv4(), ts: Date.now(), idUser: ctx.from.id.toString() };
    ctx.reply("📍 **PROTOCOLO DE UBICACIÓN.**\nEnviá tu posición GPS para el mapeo térmico.", 
        Markup.keyboard([[Markup.button.locationRequest("📍 ENVIAR GPS")], ["❌ CANCELAR"]]).resize());
});

bot.on("location", async ctx => {
    if (!ctx.session?.reporte) return;
    const r = ctx.session.reporte;
    const { latitude, longitude } = ctx.message.location;
    r.lat = latitude; r.lon = longitude;

    ctx.session.esperandoDesc = true;
    ctx.reply("🔍 **COORDENADAS CAPTADAS.**\n¿Qué estás viendo? (DNI? OVNI!):\n\n(Escribí los detalles ahora)");
});

bot.on("text", async (ctx, next) => {
    if (ctx.message.text === "❌ CANCELAR") { ctx.session = null; return ctx.reply("Protocolo abortado.", teclado); }
    if (!ctx.session?.esperandoDesc) return next();
    
    const r = ctx.session.reporte;
    r.descripcion = ctx.message.text;
    ctx.session.esperandoDesc = false;

    DB_REPORTES.push(r);
    DB_AGENTES[r.idUser].reportes++;
    guardarDB();

    const resumen = `🛸 **ALERTA AIFU**\n👤 Agente: ${ctx.from.first_name}\n🎖️ Rango: ${obtenerRango(ctx.from.id, DB_AGENTES[r.idUser].reportes)}\n📝 INFO: ${r.descripcion}`;
    bot.telegram.sendMessage(RADAR_CONO_SUR, resumen);
    
    ctx.reply("🚀 **REPORTE SUBIDO AL RADAR.**\n¡Buen laburo Agente!", teclado);
    ctx.session = null;
});

bot.hears("⭐ MI PERFIL", ctx => {
    const id = ctx.from.id.toString();
    const u = DB_AGENTES[id] || { reportes: 0 };
    const rango = obtenerRango(id, u.reportes);
    
    ctx.reply(`🪪 **EXPEDIENTE DE AGENTE**\n\n🆔 ID: \`${id}\`\n👤 Nombre: ${ctx.from.first_name}\n🛸 Reportes: ${u.reportes}\n🎖️ Rango: ${rango}\n\n${id === ADMIN_ID ? "⭐ ESTADO: PRESIDENTE Y ADMIN" : "👁️ ESTADO: OBSERVADOR"}`);
});

bot.hears("📊 ESTADÍSTICAS", ctx => {
    ctx.reply(`📊 **ESTADO DEL CIELO**\n\n🛸 Reportes totales: ${DB_REPORTES.length}\n📡 Agentes activos: ${Object.keys(DB_AGENTES).length}`);
});

bot.hears("🧉 MATE INVESTIGADOR", ctx => {
    ctx.reply("🍃 **RITUAL AIFU.**\nVigilancia activa. Ojos en el cielo, Termo Stanley bajo el brazo y Yerba Baldo lista.\n\nLa noche es nuestra.");
});

bot.hears("💳 AFILIACIÓN / PAGO", ctx => {
    ctx.reply("💳 **MEMBRESÍA AIFU.**\nApoyá la investigación oficial del Cono Sur.\n\n[PAGAR AQUÍ](https://link-de-tu-pago.com)");
});

/* ===============================
   API WEB (PARA EL RADAR)
   =============================== */
const app = express();
app.use(compression());
app.use(express.static("public"));
app.get("/radar-data", (req, res) => res.json(DB_REPORTES.slice(-100).map(r => ({
    lat: r.lat, lon: r.lon, agente: DB_AGENTES[r.idUser]?.nombre || "Agente", desc: r.descripcion
}))));

app.listen(process.env.PORT || 10000);
bot.launch();
