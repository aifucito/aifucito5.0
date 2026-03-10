import { Telegraf, Markup, session } from "telegraf";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import axios from "axios";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================
// 1. CONFIGURACIÓN Y CANALES
// ==========================================
const TOKEN = process.env.TELEGRAM_TOKEN;
const LOCATION_IQ_KEY = process.env.LOCATION_IQ_KEY;
const PUBLIC_URL = process.env.PUBLIC_URL; 

const RED_AIFU = {
    RADAR_CONO_SUR: "-1002425624773", // Central VIP
    GLOBAL: "-1002244400758",
    AR: "-1002241680145",
    CH: "-1002287236531",
    UY: "-1002441995169"
};

// Disco Persistente Render
const DATA_DIR = "/opt/render/project/src/data";
const DB_PATH = path.join(DATA_DIR, "aifucito_db.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let DB = { agentes: {}, reportes: [] };
if (fs.existsSync(DB_PATH)) {
    try { DB = JSON.parse(fs.readFileSync(DB_PATH, "utf8")); } 
    catch (e) { console.error("⚠️ Error DB"); }
}

const guardarDB = () => fs.writeFileSync(DB_PATH, JSON.stringify(DB, null, 4));

const bot = new Telegraf(TOKEN);
bot.use(session());

// ==========================================
// 2. RANGOS TÁCTICOS
// ==========================================
function obtenerRango(usuario, id) {
    if (id == 6323447957) return "🛸 COMANDANTE INTERGALÁCTICO"; // Tu ID de Telegram
    const r = usuario.reportes || 0;
    if (r >= 120) return "🌠 Almirante de la Flota del Mate";
    if (r >= 80)  return "🛡️ Guardaespalda de Alf";
    if (r >= 50)  return "👨‍🚀 Reclutador de Marcianos Arrepentidos";
    if (r >= 30)  return "🛰️ Guía Turístico de la Vía Láctea";
    if (r >= 15)  return "🥩 Parrillero de Vacas Abducidas";
    if (r >= 5)   return "🔦 Cebador de Mate del Área 51";
    return "🧻 Fajinador de Retretes Espaciales";
}

const menuPrincipal = () => Markup.keyboard([
    ["🛸 GENERAR REPORTE", "🌍 VER RADAR"],
    ["🔗 UNIRSE A MI GRUPO", "⭐ MI PERFIL"]
]).resize();

// ==========================================
// 3. COMANDOS Y SEGURIDAD
// ==========================================
bot.start((ctx) => {
    const id = ctx.from.id;
    if (!DB.agentes[id]) {
        DB.agentes[id] = { 
            nombre: ctx.from.first_name, 
            reportes: 0, 
            token: crypto.randomBytes(8).toString('hex') 
        };
        guardarDB();
    }
    ctx.reply(`🛰️ NODO AIFUCITO ONLINE\nBienvenido a AIFU: Avistamiento e Investigación de Fenómenos Uruguayos.`, menuPrincipal());
});

bot.hears("⭐ MI PERFIL", (ctx) => {
    const u = DB.agentes[ctx.from.id];
    if (!u) return;
    ctx.reply(`🪪 PERFIL DE AGENTE\n\n👤 Nombre: ${u.nombre}\n🎖️ Rango: ${obtenerRango(u, ctx.from.id)}\n📊 Reportes: ${u.reportes}`);
});

bot.hears("🌍 VER RADAR", (ctx) => {
    const u = DB.agentes[ctx.from.id];
    // Apuntamos a la raíz o al index.html con el token de seguridad
    const authUrl = `${PUBLIC_URL}/?auth=${u.token}`;
    ctx.reply(`🛰️ ACCESO AL RADAR SEGURO:`, Markup.inlineKeyboard([
        [Markup.button.url("ABRIR MAPA 🛰️", authUrl)]
    ]));
});

bot.hears("🔗 UNIRSE A MI GRUPO", (ctx) => {
    ctx.reply("Selecciona tu unidad regional (Acceso válido 5 min):", 
        Markup.inlineKeyboard([
            [Markup.button.callback("Uruguay 🇺🇾", "join_UY"), Markup.button.callback("Argentina 🇦🇷", "join_AR")],
            [Markup.button.callback("Chile 🇨🇱", "join_CH"), Markup.button.callback("Global 👽", "join_GLOBAL")]
        ])
    );
});

bot.action(/join_(.+)/, async (ctx) => {
    const region = ctx.match[1];
    const ids = { UY: RED_AIFU.UY, AR: RED_AIFU.AR, CH: RED_AIFU.CH, GLOBAL: RED_AIFU.GLOBAL };
    try {
        const link = await ctx.telegram.createChatInviteLink(ids[region], { member_limit: 1, expire_date: Math.floor(Date.now()/1000)+300 });
        ctx.answerCbQuery();
        ctx.reply(`🛡️ ACCESO CONCEDIDO:\n${link.invite_link}`);
    } catch (e) { ctx.reply("⚠️ Error: El bot debe ser Admin."); }
});

// ==========================================
// 4. REPORTES (INTERROGATORIO)
// ==========================================
bot.hears("🛸 GENERAR REPORTE", (ctx) => {
    ctx.session.reporte = { paso: "ubicacion" };
    ctx.reply("🛰️ UBICACIÓN DEL AVISTAMIENTO:", Markup.keyboard([["📍 GPS ACTUAL", "⌨️ MANUAL"], ["❌ CANCELAR"]]).resize());
});

bot.on(["location", "text", "photo", "video"], async (ctx) => {
    const r = ctx.session.reporte;
    if (!r) return;

    if (r.paso === "ubicacion") {
        if (ctx.message.location) {
            r.lat = ctx.message.location.latitude; r.lng = ctx.message.location.longitude;
            const res = await axios.get(`https://us1.locationiq.com/v1/reverse.php?key=${LOCATION_IQ_KEY}&lat=${r.lat}&lon=${r.lng}&format=json`);
            r.pais = res.data.address.country; r.ciudad = res.data.address.city || res.data.address.town;
            r.barrio = res.data.address.suburb || "Zona Rural";
            r.paso = "int_1";
            return ctx.reply(`📍 ${r.barrio}, ${r.ciudad}. ¿Qué viste?`, Markup.removeKeyboard());
        }
        if (ctx.message.text === "⌨️ MANUAL") { r.paso = "m_pais"; return ctx.reply("PAÍS:"); }
    }

    if (r.paso === "m_pais") { r.pais = ctx.message.text; r.paso = "m_ciudad"; return ctx.reply("CIUDAD:"); }
    if (r.paso === "m_ciudad") { r.ciudad = ctx.message.text; r.paso = "m_barrio"; return ctx.reply("BARRIO:"); }
    if (r.paso === "m_barrio") { r.barrio = ctx.message.text; r.paso = "int_1"; return ctx.reply("¿Qué viste?"); }

    if (r.paso === "int_1") {
        r.desc = ctx.message.text; r.paso = "int_2";
        return ctx.reply("¿Se movía?", Markup.keyboard([["SÍ", "NO", "Errático"]]).resize());
    }
    if (r.paso === "int_2") {
        r.mov = ctx.message.text; r.paso = "multimedia";
        return ctx.reply("📸 ENVÍA FOTO HD O VIDEO. O /saltar", Markup.removeKeyboard());
    }

    if (r.paso === "multimedia") {
        if (ctx.message.photo || ctx.message.video) {
            r.fileId = ctx.message.photo ? ctx.message.photo[ctx.message.photo.length-1].file_id : ctx.message.video.file_id;
            r.tipo = ctx.message.photo ? "foto" : "video";
            await finalizarReporte(ctx, r);
        }
    }
});

bot.command("saltar", async (ctx) => { if (ctx.session.reporte?.paso === "multimedia") await finalizarReporte(ctx, ctx.session.reporte); });

async function finalizarReporte(ctx, r) {
    const u = DB.agentes[ctx.from.id]; u.reportes++;
    DB.reportes.push({ lat: r.lat, lng: r.lng, pais: r.pais, ciudad: r.ciudad, fecha: new Date(), tipo: r.desc });
    guardarDB();

    let cNac = RED_AIFU.GLOBAL; let esG = true;
    const p = r.pais.toUpperCase();
    if (p.includes("URUGUAY")) { cNac = RED_AIFU.UY; esG = false; }
    else if (p.includes("ARGENTINA")) { cNac = RED_AIFU.AR; esG = false; }
    else if (p.includes("CHILE")) { cNac = RED_AIFU.CH; esG = false; }

    ctx.telegram.sendMessage(cNac, `📢 REPORTE: ${r.ciudad}\n🛸 ${r.desc}\n🚀 Mov: ${r.mov}`);

    const txtVIP = `🚨 REPORTE CENTRAL\n📍 ${r.barrio}, ${r.ciudad} (${r.pais})\n👤 Agente: ${u.nombre} [${obtenerRango(u, ctx.from.id)}]\n📝 ${r.desc}\n🚀 Mov: ${r.mov}`;
    if (r.fileId) {
        if (r.tipo === "foto") await ctx.telegram.sendPhoto(RED_AIFU.RADAR_CONO_SUR, r.fileId, { caption: txtVIP });
        else await ctx.telegram.sendVideo(RED_AIFU.RADAR_CONO_SUR, r.fileId, { caption: txtVIP });
    } else await ctx.telegram.sendMessage(RED_AIFU.RADAR_CONO_SUR, txtVIP);

    ctx.reply(esG ? "✅ Enviado. ¡Únete al Global!: https://t.me/+r5XfcJma3g03MWZh" : "✅ Reporte enviado al Radar.", menuPrincipal());
    ctx.session.reporte = null;
}

// ==========================================
// 5. SERVIDOR WEB (INDEX.HTML PROTEGIDO)
// ==========================================
const app = express();
app.use(express.static('public'));

// Ruta raíz que sirve el index.html con seguridad
app.get("/", (req, res) => {
    const token = req.query.auth;
    const esValido = Object.values(DB.agentes).some(a => a.token === token);
    if (esValido) {
        res.sendFile(path.join(__dirname, "public", "index.html"));
    } else {
        res.status(403).send("<h1>🚫 Acceso Denegado</h1><p>Usa el Bot oficial de AIFU.</p>");
    }
});

app.get("/api/reportes", (req, res) => res.json(DB.reportes));

bot.launch();
app.listen(process.env.PORT || 10000, '0.0.0.0');
