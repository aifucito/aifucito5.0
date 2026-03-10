import { Telegraf, Markup, session } from "telegraf";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import axios from "axios";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOKEN = process.env.TELEGRAM_TOKEN;
const LOCATION_IQ_KEY = process.env.LOCATION_IQ_KEY;
const PUBLIC_URL = process.env.PUBLIC_URL; 

const RED_AIFU = {
    ID_CONO_SUR: "-1002425624773", 
    LINK_CONO_SUR: "https://t.me/+YqA6d3VpKv9mZjU5",
    LINK_GLOBAL: "https://t.me/+r5XfcJma3g03MWZh",
    LINK_AR: "https://t.me/+QpErPk26SY05OGIx",
    LINK_CH: "https://t.me/+VP2T47eLvIowNmYx",
    LINK_UY: "https://t.me/+nCVD4NsOihIyNGFh"
};

const DATA_DIR = "/opt/render/project/src/data";
const DB_PATH = path.join(DATA_DIR, "aifucito_db.json");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let DB = { agentes: {}, reportes: [] };
if (fs.existsSync(DB_PATH)) {
    try { DB = JSON.parse(fs.readFileSync(DB_PATH, "utf8")); } catch (e) {}
}
const guardarDB = () => fs.writeFileSync(DB_PATH, JSON.stringify(DB, null, 4));

const bot = new Telegraf(TOKEN);
bot.use(session());

function obtenerRango(usuario, id) {
    if (id == 7662736311) return "🛸 COMANDANTE INTERGALÁCTICO"; 
    const r = usuario.reportes || 0;
    if (r >= 5) return "🔦 Cebador de Mate del Área 51";
    return "🧻 Fajinador de Retretes Espaciales";
}

const menuPrincipal = () => Markup.keyboard([
    ["🛸 GENERAR REPORTE", "🌍 VER RADAR"],
    ["🔗 UNIRSE A MI GRUPO", "⭐ MI PERFIL"]
]).resize();

bot.start((ctx) => {
    const id = ctx.from.id;
    if (!DB.agentes[id]) {
        DB.agentes[id] = { nombre: ctx.from.first_name, reportes: 0, token: crypto.randomBytes(8).toString('hex'), vip: (id == 7662736311) };
        guardarDB();
    }
    ctx.reply(`🛰️ NODO AIFUCITO ONLINE\n\nBienvenido Comandante Damián.`, menuPrincipal());
});

bot.hears("⭐ MI PERFIL", (ctx) => {
    const u = DB.agentes[ctx.from.id];
    if (!u) return ctx.reply("Inicia con /start");
    ctx.reply(`🪪 PERFIL DE AGENTE\n\n👤 Nombre: ${u.nombre}\n🎖️ Rango: ${obtenerRango(u, ctx.from.id)}\n📊 Reportes: ${u.reportes}\n🆔 ID: ${ctx.from.id}`);
});

bot.hears("🌍 VER RADAR", (ctx) => {
    const u = DB.agentes[ctx.from.id];
    const authUrl = `${PUBLIC_URL}/?auth=${u.token}`;
    ctx.reply(`🛰️ ACCESO AL RADAR SEGURO:`, Markup.inlineKeyboard([[Markup.button.url("ABRIR MAPA 🛰️", authUrl)]]));
});

bot.hears("🔗 UNIRSE A MI GRUPO", (ctx) => {
    const botones = [[Markup.button.url("Uruguay 🇺🇾", RED_AIFU.LINK_UY), Markup.button.url("Argentina 🇦🇷", RED_AIFU.LINK_AR)], [Markup.button.url("Chile 🇨🇱", RED_AIFU.LINK_CH), Markup.button.url("Global 👽", RED_AIFU.LINK_GLOBAL)]];
    if (ctx.from.id == 7662736311) botones.push([Markup.button.url("🔥 RADAR CONO SUR (VIP)", RED_AIFU.LINK_CONO_SUR)]);
    ctx.reply("Unirse a la red regional:", Markup.inlineKeyboard(botones));
});

// ==========================================
// 4. PROTOCOLO DE REPORTE (PASO A PASO)
// ==========================================
bot.hears("🛸 GENERAR REPORTE", (ctx) => {
    ctx.session = { reporte: { paso: "ubicacion", lat: 0, lng: 0 } }; // Coordenadas por defecto para evitar errores
    ctx.reply("📍 ¿Dónde ocurrió el avistamiento?", Markup.keyboard([["📍 ENVIAR MI GPS", "⌨️ ESCRIBIR CIUDAD"], ["❌ CANCELAR"]]).resize());
});

bot.hears("❌ CANCELAR", (ctx) => {
    ctx.session = null;
    ctx.reply("Reporte cancelado.", menuPrincipal());
});

bot.on(["location", "text", "photo", "video"], async (ctx) => {
    if (!ctx.session?.reporte) return;
    const r = ctx.session.reporte;

    // A. UBICACION
    if (r.paso === "ubicacion") {
        if (ctx.message.location) {
            r.lat = ctx.message.location.latitude; 
            r.lng = ctx.message.location.longitude;
            try {
                const res = await axios.get(`https://us1.locationiq.com/v1/reverse.php?key=${LOCATION_IQ_KEY}&lat=${r.lat}&lon=${r.lng}&format=json`);
                r.pais = res.data.address.country || "Uruguay";
                r.ciudad = res.data.address.city || res.data.address.town || "Desconocida";
                r.barrio = res.data.address.suburb || "Zona Rural";
                r.paso = "int_1";
                return ctx.reply(`📍 Detectado en: ${r.ciudad}.\n\n¿Qué viste en el cielo? (Descríbelo brevemente)`, Markup.removeKeyboard());
            } catch (e) { 
                r.paso = "m_pais"; 
                return ctx.reply("⚠️ Error de GPS. Escribe el PAÍS manualmente:", Markup.removeKeyboard()); 
            }
        }
        if (ctx.message.text === "⌨️ ESCRIBIR CIUDAD") { 
            r.paso = "m_pais"; 
            return ctx.reply("Escribe el PAÍS:", Markup.removeKeyboard()); 
        }
    }

    // PASOS MANUALES
    if (r.paso === "m_pais") { r.pais = ctx.message.text; r.paso = "m_ciudad"; return ctx.reply("Escribe la CIUDAD:"); }
    if (r.paso === "m_ciudad") { r.ciudad = ctx.message.text; r.paso = "m_barrio"; return ctx.reply("Escribe el BARRIO:"); }
    if (r.paso === "m_barrio") { r.barrio = ctx.message.text; r.paso = "int_1"; return ctx.reply("¿Qué viste?"); }

    // B. DESCRIPCION Y MOVIMIENTO
    if (r.paso === "int_1") {
        r.desc = ctx.message.text; r.paso = "int_2";
        return ctx.reply("¿Tenía movimiento inteligente o errático?", Markup.keyboard([["SÍ", "NO", "ERRÁTICO"]]).oneTime().resize());
    }
    if (r.paso === "int_2") {
        r.mov = ctx.message.text; r.paso = "multimedia";
        return ctx.reply("📸 ¿Tienes evidencia?\n\nEnvía la FOTO o VIDEO ahora.\nSi no tienes, presiona el botón de abajo:", Markup.keyboard([["🚫 NO, ENVIAR SOLO TEXTO"], ["❌ CANCELAR"]]).resize());
    }

    // C. FINALIZACIÓN
    if (r.paso === "multimedia") {
        if (ctx.message.text === "🚫 NO, ENVIAR SOLO TEXTO") {
            await finalizarReporte(ctx, r);
        } else if (ctx.message.photo || ctx.message.video) {
            r.fileId = ctx.message.photo ? ctx.message.photo[ctx.message.photo.length-1].file_id : ctx.message.video.file_id;
            r.tipo = ctx.message.photo ? "foto" : "video";
            await finalizarReporte(ctx, r);
        }
    }
});

async function finalizarReporte(ctx, r) {
    const u = DB.agentes[ctx.from.id]; 
    if (u) u.reportes++;

    // Guardar en Base de Datos para el Mapa
    DB.reportes.push({ 
        lat: r.lat || -34.9011, // Si es manual y no hay lat, ponemos Montevideo por defecto o 0
        lng: r.lng || -56.1645, 
        pais: r.pais || "Uruguay", 
        ciudad: r.ciudad || "Manual", 
        fecha: new Date(), 
        tipo: r.desc 
    });
    guardarDB();

    const txtVIP = `🚨 NUEVO REPORTE AIFU\n📍 ${r.ciudad}, ${r.pais}\n👤 Agente: ${u.nombre}\n🚀 Mov: ${r.mov}\n📝 ${r.desc}`;
    
    try {
        if (r.fileId) {
            if (r.tipo === "foto") await ctx.telegram.sendPhoto(RED_AIFU.ID_CONO_SUR, r.fileId, { caption: txtVIP });
            else await ctx.telegram.sendVideo(RED_AIFU.ID_CONO_SUR, r.fileId, { caption: txtVIP });
        } else {
            await ctx.telegram.sendMessage(RED_AIFU.ID_CONO_SUR, txtVIP);
        }
    } catch (e) { console.error("Error envío canal:", e); }

    // MENSAJE DE ÉXITO FINAL
    await ctx.reply(`✅ REPORTE RECIBIDO\n\nGracias Agente ${u.nombre}. Tu informe ha sido publicado en el Radar y sumado a tu historial.`, menuPrincipal());
    ctx.session = null;
}

const app = express();
app.use(express.static('public'));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/api/reportes", (req, res) => res.json(DB.reportes));

bot.launch();
app.listen(process.env.PORT || 10000, '0.0.0.0');
