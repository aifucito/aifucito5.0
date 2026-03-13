import { Telegraf, Markup, session } from "telegraf";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ================================
   VARIABLES DE ENTORNO
================================ */
const TOKEN = process.env.TELEGRAM_TOKEN;
const LOCATION_IQ_KEY = process.env.LOCATION_IQ_KEY;

/* ================================
   RED DE CANALES AIFU
================================ */
const RED_AIFU = {
    ID_CONO_SUR: "-1002388657640",
    ID_UY: "-1002347230353",
    ID_AR: "-1002410312674",
    ID_CH: "-1002283925519",
    ID_GLOBAL: "-1002414775486",
    LINK_CONO_SUR: "https://t.me/+YqA6d3VpKv9mZjU5",
    LINK_GLOBAL: "https://t.me/+r5XfcJma3g03MWZh",
    LINK_UY: "https://t.me/+nCVD4NsOihIyNGFh",
    LINK_AR: "https://t.me/+QpErPk26SY05OGIx",
    LINK_CH: "https://t.me/+VP2T47eLvIowNmYx"
};

/* ================================
   BASE DE DATOS
================================ */
const DATA_DIR = "/opt/render/project/src/data";
const DB_PATH = path.join(DATA_DIR, "aifucito_db.json");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

let DB = { agentes: {}, reportes: [] };
if (fs.existsSync(DB_PATH)) {
    try { DB = JSON.parse(fs.readFileSync(DB_PATH, "utf8")); } catch { console.log("Iniciando DB"); }
}

function guardarDB() { fs.writeFileSync(DB_PATH, JSON.stringify(DB, null, 4)); }

/* ================================
   BOT TELEGRAM - LÓGICA
================================ */
const bot = new Telegraf(TOKEN);
bot.use(session());

function obtenerRango(usuario, id) {
    if (id == 7662736311) return "🛸 COMANDANTE INTERGALÁCTICO";
    const r = usuario.reportes || 0;
    if (r >= 10) return "👽 Investigador Senior";
    if (r >= 5) return "🔦 Cebador de Mate del Área 51";
    return "🧻 Fajinador de Retretes Espaciales";
}

const menuPrincipal = () => Markup.keyboard([
    ["🛸 GENERAR REPORTE", "🌍 VER RADAR"],
    ["🔗 UNIRSE A MI GRUPO", "⭐ MI PERFIL"]
]).resize();

/* ================================
   COMANDOS
================================ */
bot.start((ctx) => {
    const id = ctx.from.id;
    if (!DB.agentes[id]) {
        DB.agentes[id] = { nombre: ctx.from.first_name, reportes: 0, token: crypto.randomBytes(8).toString("hex") };
        guardarDB();
    }
    ctx.reply("🛰️ AIFUCITO ONLINE - Sistema de Vigilancia Aeroespacial", menuPrincipal());
});

bot.hears("⭐ MI PERFIL", (ctx) => {
    const u = DB.agentes[ctx.from.id];
    ctx.reply(`🪪 PERFIL DE AGENTE\n\n👤 Nombre: ${u.nombre}\n🎖️ Rango: ${obtenerRango(u, ctx.from.id)}\n📊 Reportes: ${u.reportes}`);
});

bot.hears("🌍 VER RADAR", (ctx) => {
    ctx.reply("🛰️ Radar AIFU en vivo", Markup.inlineKeyboard([
        [Markup.button.url("ABRIR RADAR 🛰️", process.env.PUBLIC_URL || "https://aifucito5-0.onrender.com")]
    ]));
});

bot.hears("🔗 UNIRSE A MI GRUPO", (ctx) => {
    ctx.reply("Selecciona tu zona:", Markup.inlineKeyboard([
        [Markup.button.url("Uruguay 🇺🇾", RED_AIFU.LINK_UY), Markup.button.url("Argentina 🇦🇷", RED_AIFU.LINK_AR)],
        [Markup.button.url("Chile 🇨🇱", RED_AIFU.LINK_CH), Markup.button.url("Global 👽", RED_AIFU.LINK_GLOBAL)],
        [Markup.button.url("Radar Cono Sur 🛰️", RED_AIFU.LINK_CONO_SUR)]
    ]));
});

/* ================================
   FLUJO DE REPORTE (CORREGIDO)
================================ */
bot.hears("🛸 GENERAR REPORTE", (ctx) => {
    ctx.session = { reporte: { paso: "ubicacion" } };
    ctx.reply("📍 ¿Dónde ocurrió el avistamiento?", Markup.keyboard([
        [Markup.button.locationRequest("📍 ENVIAR MI GPS")],
        ["⌨️ ESCRIBIR CIUDAD"],
        ["❌ CANCELAR"]
    ]).resize());
});

bot.hears("❌ CANCELAR", (ctx) => {
    ctx.session = null;
    ctx.reply("Reporte cancelado.", menuPrincipal());
});

bot.on(["location", "text", "photo", "video"], async (ctx) => {
    if (!ctx.session?.reporte) return;
    const r = ctx.session.reporte;
    const msg = ctx.message.text;

    // INTERRUPTOR DE PRIORIDAD: EL BOTÓN FINAL
    if (msg === "🚀 FINALIZAR Y PUBLICAR EN CANALES") {
        return finalizarReporte(ctx, r);
    }

    // 1. PASO UBICACIÓN
    if (r.paso === "ubicacion") {
        if (ctx.message.location) {
            r.lat = ctx.message.location.latitude;
            r.lng = ctx.message.location.longitude;
            try {
                const geo = await axios.get(`https://us1.locationiq.com/v1/reverse.php`, {
                    params: { key: LOCATION_IQ_KEY, lat: r.lat, lon: r.lng, format: "json" }
                });
                const addr = geo.data.address || {};
                r.pais = addr.country || "Desconocido";
                r.ciudad = addr.city || addr.town || addr.village || "Zona rural";
                r.barrio = addr.suburb || addr.neighbourhood || "";
            } catch { r.pais = "Desconocido"; r.ciudad = "GPS"; }
            r.paso = "descripcion";
            return ctx.reply("📍 Ubicación fijada. ¿Qué viste en el cielo?", Markup.removeKeyboard());
        }
        if (msg?.includes("ESCRIBIR")) {
            r.paso = "pais";
            return ctx.reply("Escribe el PAÍS:", Markup.removeKeyboard());
        }
    }

    // MANUAL: PAÍS -> CIUDAD -> BARRIO
    if (r.paso === "pais" && msg) { r.pais = msg; r.paso = "ciudad"; return ctx.reply("Escribe la CIUDAD:"); }
    if (r.paso === "ciudad" && msg) { r.ciudad = msg; r.paso = "barrio"; return ctx.reply("Escribe el BARRIO o ZONA (O escribe 'No'):"); }
    if (r.paso === "barrio" && msg) {
        r.barrio = msg.toLowerCase() === "no" ? "" : msg;
        try {
            const q = r.barrio ? `${r.barrio}, ${r.ciudad}, ${r.pais}` : `${r.ciudad}, ${r.pais}`;
            const g = await axios.get("https://us1.locationiq.com/v1/search.php", {
                params: { key: LOCATION_IQ_KEY, q: q, format: "json", limit: 1 }
            });
            r.lat = parseFloat(g.data[0].lat);
            r.lng = parseFloat(g.data[0].lon);
        } catch { r.lat = -34.9; r.lng = -56.16; }
        r.paso = "descripcion";
        return ctx.reply("¿Qué viste en el cielo?");
    }

    // DESCRIPCIÓN -> MOVIMIENTO
    if (r.paso === "descripcion" && msg) {
        r.desc = msg; r.paso = "mov";
        return ctx.reply("¿Tenía movimiento?", Markup.keyboard([["SÍ", "NO", "ERRÁTICO"]]).resize());
    }

    // MOVIMIENTO -> MEDIA
    if (r.paso === "mov" && msg) {
        r.mov = msg; r.paso = "media";
        return ctx.reply("Envía FOTO, VIDEO o pulsa el botón:", Markup.keyboard([["🚫 SIN EVIDENCIA"]]).resize());
    }

    // MEDIA -> CONFIRMACIÓN
    if (r.paso === "media") {
        if (msg === "🚫 SIN EVIDENCIA") {
            r.fileId = null;
        } else if (ctx.message.photo) {
            r.fileId = ctx.message.photo.pop().file_id; r.tipo = "foto";
        } else if (ctx.message.video) {
            r.fileId = ctx.message.video.file_id; r.tipo = "video";
        } else { return; }

        r.paso = "confirmar";
        return ctx.reply("✅ Información lista para el despliegue.", 
            Markup.keyboard([["🚀 FINALIZAR Y PUBLICAR EN CANALES"], ["❌ CANCELAR"]]).resize());
    }
});

/* ================================
   FINALIZAR Y PUBLICAR (MOTOR DE ENVÍO)
================================ */
async function finalizarReporte(ctx, r) {
    const u = DB.agentes[ctx.from.id];
    if (u) u.reportes = (u.reportes || 0) + 1;

    const nuevo = {
        lat: r.lat || -34.6, lng: r.lng || -58.4,
        pais: r.pais || "Desconocido",
        ciudad: r.ciudad || "Sin ciudad",
        barrio: r.barrio || "",
        fecha: new Date().toISOString(),
        descripcion: r.desc || "Sin descripción",
        movimiento: r.mov || "No especificado",
        agente: u?.nombre || "Anónimo"
    };

    DB.reportes.push(nuevo);
    guardarDB();

    const locFinal = nuevo.barrio ? `${nuevo.barrio}, ${nuevo.ciudad}, ${nuevo.pais}` : `${nuevo.ciudad}, ${nuevo.pais}`;
    const mensaje = `🚨 NUEVO AVISTAMIENTO\n\n📍 ${locFinal}\n👤 Agente: ${nuevo.agente}\n🚀 Movimiento: ${nuevo.movimiento}\n\n📝 ${nuevo.descripcion}`;

    // RUTEO EXCLUSIVO AIFU
    const paisL = nuevo.pais.toLowerCase();
    let destinos = [RED_AIFU.ID_CONO_SUR]; // Siempre Cono Sur

    if (paisL.includes("uruguay")) destinos.push(RED_AIFU.ID_UY);
    else if (paisL.includes("argentina")) destinos.push(RED_AIFU.ID_AR);
    else if (paisL.includes("chile")) destinos.push(RED_AIFU.ID_CH);
    else destinos.push(RED_AIFU.ID_GLOBAL);

    for (const id of destinos) {
        try {
            if (r.fileId) {
                if (r.tipo === "foto") await ctx.telegram.sendPhoto(id, r.fileId, { caption: mensaje });
                else await ctx.telegram.sendVideo(id, r.fileId, { caption: mensaje });
            } else {
                await ctx.telegram.sendMessage(id, mensaje);
            }
        } catch (e) { console.log(`Error enviando a canal ${id}`); }
    }

    ctx.session = null;
    return ctx.reply("✅ Reporte integrado al Radar AIFU y publicado en canales.", menuPrincipal());
}

/* ================================
   SERVIDOR
================================ */
const app = express();
app.use(express.static("public"));
app.get("/api/reportes", (req, res) => res.json(DB.reportes));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Servidor Web Activo"));
bot.launch().then(() => console.log("AIFUCITO ONLINE"));
