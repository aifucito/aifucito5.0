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
const ADMIN_ID = "7662736311"; // TU ID DE DAMIÁN
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
    } catch { log("DB", "Bases de datos listas."); }
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
   INTERFAZ PRINCIPAL (BOTONES CORREGIDOS)
   =============================== */
const teclado = Markup.keyboard([
    ["🛸 GENERAR REPORTE", Markup.button.webApp("🌍 VER RADAR", WEBAPP_URL)],
    ["⭐ MI PERFIL", "📊 ESTADÍSTICAS"],
    ["💳 AFILIACIÓN / PAGO", "🧉 MATE INVESTIGADOR"]
]).resize();

/* ===============================
   LÓGICA DE USUARIO Y RANGOS
   =============================== */
function obtenerRango(id, reportes) {
    if (id.toString() === ADMIN_ID) return "💎 PRESIDENTE AIFU";
    if (reportes >= 50) return "🛰️ Investigador Élite";
    if (reportes >= 10) return "📡 Investigador";
    return "👁️ Observador";
}

bot.start(ctx => {
    const id = ctx.from.id.toString();
    
    // SI SOS VOS, EL SISTEMA TE MARCA COMO VIP Y ADMIN AUTOMÁTICAMENTE
    if (!DB_AGENTES[id]) {
        DB_AGENTES[id] = { 
            nombre: ctx.from.first_name, 
            reportes: 0, 
            vip: (id === ADMIN_ID) 
        };
    } else if (id === ADMIN_ID) {
        DB_AGENTES[id].vip = true; // Asegura que siempre seas VIP
    }
    
    guardarDB();
    ctx.reply(`🛸 ¡BIENVENIDO PRESIDENTE DAMIÁN!\n\nEl sistema AIFUCITO 5.0 está operativo y sincronizado con el Radar Cono Sur.`, teclado);
});

/* ===============================
   ACCIONES DE LOS BOTONES
   =============================== */

// 1. REPORTE
bot.hears("🛸 GENERAR REPORTE", ctx => {
    ctx.session.reporte = { id: uuidv4(), ts: Date.now(), idUser: ctx.from.id.toString() };
    ctx.reply("📍 Para iniciar el reporte, necesito tu ubicación GPS.", Markup.keyboard([[Markup.button.locationRequest("📍 ENVIAR MI UBICACIÓN")], ["❌ CANCELAR"]]).resize());
});

// 2. MATE INVESTIGADOR (Tu ritual de Yerba Baldo y Stanley)
bot.hears("🧉 MATE INVESTIGADOR", ctx => {
    ctx.reply("🍃 Vigilancia nocturna activa.\nTermo Stanley cargado, Yerba Baldo lista y ojos en el cielo.\n\n¡Buena jornada de observación, Agente!");
});

// 3. MI PERFIL (Corregido para mostrar tu cargo)
bot.hears("⭐ MI PERFIL", ctx => {
    const id = ctx.from.id.toString();
    const u = DB_AGENTES[id] || { reportes: 0, vip: false };
    const rango = obtenerRango(id, u.reportes);
    
    ctx.reply(`🪪 **EXPEDIENTE AIFU**\n\n👤 Agente: ${ctx.from.first_name}\n🆔 ID: \`${id}\`\n🛸 Reportes: ${u.reportes}\n🎖️ Rango: ${rango}\n${u.vip ? "⭐ ESTADO: INVESTIGADOR VIP (Acceso Multimedia)" : "👁️ ESTADO: OBSERVADOR"}`);
});

// 4. ESTADÍSTICAS
bot.hears("📊 ESTADÍSTICAS", ctx => {
    const hoy = new Date().setHours(0,0,0,0);
    const reportesHoy = DB_REPORTES.filter(r => r.ts > hoy).length;
    ctx.reply(`📊 **RADAR ESTADÍSTICO**\n\n🛸 Avistamientos hoy: ${reportesHoy}\n📈 Total histórico: ${DB_REPORTES.length}\n📡 Red de Agentes: ${Object.keys(DB_AGENTES).length}`);
});

// 5. PAGO / AFILIACIÓN
bot.hears("💳 AFILIACIÓN / PAGO", ctx => {
    ctx.reply("💳 **MEMBRESÍA AIFU**\n\nApoyá la investigación oficial. La membresía vitalicia tiene un costo de $1.50 USD.\n\n🔗 [HACER PAGO AQUÍ](https://link-de-tu-pago-aqui.com)", Markup.inlineKeyboard([
        [Markup.button.url("💳 PAGAR AHORA", "https://link-de-tu-pago-aqui.com")]
    ]));
});

/* ===============================
   MANEJO DE UBICACIÓN Y FINALIZACIÓN
   =============================== */
bot.on("location", async ctx => {
    if (!ctx.session?.reporte) return;
    const r = ctx.session.reporte;
    const { latitude, longitude } = ctx.message.location;
    r.lat = latitude; r.lon = longitude;

    ctx.reply("🔍 Identificando zona...");
    try {
        const res = await axios.get("https://nominatim.openstreetmap.org/reverse", { 
            params: { lat: latitude, lon: longitude, format: "json" }, 
            headers: { "User-Agent": "AIFU-Radar" } 
        });
        r.ciudad = res.data.address.city || res.data.address.town || "Zona Rural";
    } catch { r.ciudad = "Coordenadas GPS"; }

    ctx.session.esperandoDesc = true;
    ctx.reply(`📍 Ubicación: ${r.ciudad}\n\n¿Qué estás observando? Describí el fenómeno:`);
});

bot.on("text", async (ctx, next) => {
    if (ctx.message.text === "❌ CANCELAR") { ctx.session = null; return ctx.reply("Acción cancelada.", teclado); }
    if (!ctx.session?.esperandoDesc) return next();
    
    const r = ctx.session.reporte;
    r.descripcion = ctx.message.text;
    ctx.session.esperandoDesc = false;

    DB_REPORTES.push(r);
    DB_AGENTES[r.idUser].reportes++;
    guardarDB();

    const resumen = `🛸 **NUEVO REPORTE**\n📍 ${r.ciudad}\n👤 ${ctx.from.first_name}\n📝 ${r.descripcion}`;
    bot.telegram.sendMessage(RADAR_CONO_SUR, resumen);
    
    ctx.reply("🚀 ¡Reporte enviado con éxito al Radar Cono Sur!", teclado);
    ctx.session = null;
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
        agente: DB_AGENTES[r.idUser]?.nombre || "Anon"
    })));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => log("WEB", "Online"));
bot.launch();
