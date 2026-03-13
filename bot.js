import "dotenv/config";
import { Telegraf, Markup, session } from "telegraf";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import cors from "cors";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ================================
   CONFIGURACIÓN DE RED AIFU
================================ */
const TOKEN = process.env.TELEGRAM_TOKEN;
const LOCATION_IQ_KEY = process.env.LOCATION_IQ_KEY;

const RED_AIFU = {
    ID_CONO_SUR: "-1002388657640",
    ID_UY: "-1002347230353",
    ID_AR: "-1002410312674",
    ID_CH: "-1002283925519",
    ID_GLOBAL: "-1002414775486",
    LINK_CONO_SUR: "https://t.me/+YqA6d3VpKv9mZjU5",
    LINK_UY: "https://t.me/+nCVD4NsOihIyNGFh",
    LINK_AR: "https://t.me/+QpErPk26SY05OGIx",
    LINK_CH: "https://t.me/+VP2T47eLvIowNmYx",
    LINK_GLOBAL: "https://t.me/+r5XfcJma3g03MWZh"
};

/* ================================
   BASE DE DATOS Y PERSISTENCIA
================================ */
// Ruta específica para que Render no borre los datos al reiniciar
const DATA_DIR = "/opt/render/project/src/data"; 
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, "reportes.json");

let DB = { agentes: {}, reportes: [] };
if (fs.existsSync(DB_PATH)) {
    try { DB = JSON.parse(fs.readFileSync(DB_PATH, "utf8")); } catch (e) { console.log("Iniciando nueva base de datos"); }
}

const guardarDB = () => fs.writeFileSync(DB_PATH, JSON.stringify(DB, null, 4));

/* ================================
   LÓGICA DE RANGOS
================================ */
function obtenerRango(usuario, id) {
    if (id == 7662736311) return "🛸 COMANDANTE INTERGALÁCTICO";
    const r = usuario.reportes || 0;
    if (r >= 10) return "👽 Investigador Senior";
    if (r >= 5) return "🔦 Cebador de Mate del Área 51";
    return "🧻 Fajinador de Retretes Espaciales";
}

/* ================================
   SERVIDOR EXPRESS Y RADAR
================================ */
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let radarClientes = [];

// Latido (Ping) para mantener activa la conexión SSE en el vivo
setInterval(() => {
    radarClientes.forEach(c => { try { c.write(": ping\n\n"); } catch (e) {} });
}, 20000);

function emitirRadar(reporte) {
    const data = `data: ${JSON.stringify(reporte)}\n\n`;
    radarClientes.forEach(c => { try { c.write(data); } catch (e) {} });
}

app.get("/api/live", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    radarClientes.push(res);
    req.on("close", () => { radarClientes = radarClientes.filter(c => c !== res); });
});

app.get("/api/reportes", (req, res) => {
    res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' });
    res.json(DB.reportes);
});

/* ================================
   BOT DE TELEGRAM
================================ */
const bot = new Telegraf(TOKEN);
bot.use(session());

const menuPrincipal = () => Markup.keyboard([
    ["🛸 GENERAR REPORTE", "🌍 VER RADAR"],
    ["🔗 UNIRSE A MI GRUPO", "⭐ MI PERFIL"]
]).resize();

bot.start((ctx) => {
    const id = ctx.from.id;
    if (!DB.agentes[id]) {
        DB.agentes[id] = { nombre: ctx.from.first_name, reportes: 0 };
        guardarDB();
    }
    ctx.reply("🛰️ AIFUCITO ONLINE - Sistema de Vigilancia Activo", menuPrincipal());
});

bot.hears("⭐ MI PERFIL", (ctx) => {
    const u = DB.agentes[ctx.from.id] || { nombre: ctx.from.first_name, reportes: 0 };
    ctx.reply(`🪪 PERFIL DE AGENTE\n\n👤 Nombre: ${u.nombre}\n🎖️ Rango: ${obtenerRango(u, ctx.from.id)}\n📊 Reportes: ${u.reportes}`);
});

bot.hears("🌍 VER RADAR", (ctx) => {
    ctx.reply("Accede al Radar Táctico:", Markup.inlineKeyboard([
        [Markup.button.url("ABRIR MAPA 🛰️", process.env.PUBLIC_URL || "https://tu-app.onrender.com")]
    ]));
});

bot.hears("🔗 UNIRSE A MI GRUPO", (ctx) => {
    ctx.reply("Selecciona zona:", Markup.inlineKeyboard([
        [Markup.button.url("Uruguay 🇺🇾", RED_AIFU.LINK_UY), Markup.button.url("Argentina 🇦🇷", RED_AIFU.LINK_AR)],
        [Markup.button.url("Chile 🇨🇱", RED_AIFU.LINK_CH), Markup.button.url("Global 👽", RED_AIFU.LINK_GLOBAL)],
        [Markup.button.url("Radar Cono Sur 🛰️", RED_AIFU.LINK_CONO_SUR)]
    ]));
});

/* FLUJO DE REPORTE TÁCTICO */
bot.hears("🛸 GENERAR REPORTE", (ctx) => {
    ctx.session = { reporte: { paso: "ubicacion" } };
    ctx.reply("📍 Ubicación:", Markup.keyboard([
        [Markup.button.locationRequest("📍 ENVIAR MI GPS")],
        ["⌨️ MANUAL", "❌ CANCELAR"]
    ]).resize());
});

bot.on(["location", "text"], async (ctx) => {
    if (!ctx.session?.reporte) return;
    const r = ctx.session.reporte;
    const msg = ctx.message.text;

    if (msg === "❌ CANCELAR") { ctx.session = null; return ctx.reply("Reporte cancelado.", menuPrincipal()); }
    if (msg === "🚀 FINALIZAR Y PUBLICAR") return finalizarReporte(ctx, r);

    if (r.paso === "ubicacion") {
        if (ctx.message.location) {
            r.lat = ctx.message.location.latitude;
            r.lng = ctx.message.location.longitude;
            try {
                const g = await axios.get(`https://us1.locationiq.com/v1/reverse.php?key=${LOCATION_IQ_KEY}&lat=${r.lat}&lon=${r.lng}&format=json`);
                r.pais = g.data.address.country || "Desconocido";
                r.ciudad = g.data.address.city || g.data.address.town || "S/D";
            } catch { r.pais = "Desconocido"; }
            r.paso = "descripcion";
            return ctx.reply("📍 Ubicación fijada. ¿Qué viste?", Markup.removeKeyboard());
        }
        if (msg === "⌨️ MANUAL") { r.paso = "pais"; return ctx.reply("País:", Markup.removeKeyboard()); }
    }

    if (r.paso === "pais") { r.pais = msg; r.paso = "ciudad"; return ctx.reply("Ciudad:"); }
    if (r.paso === "ciudad") { r.ciudad = msg; r.paso = "barrio"; return ctx.reply("Barrio (o 'No'):"); }
    if (r.paso === "barrio") {
        r.barrio = msg.toLowerCase() === "no" ? "" : msg;
        try {
            const q = `${r.barrio} ${r.ciudad} ${r.pais}`;
            const g = await axios.get(`https://us1.locationiq.com/v1/search.php?key=${LOCATION_IQ_KEY}&q=${q}&format=json&limit=1`);
            r.lat = g.data[0].lat; r.lng = g.data[0].lon;
        } catch { r.lat = -34.6; r.lng = -58.4; }
        r.paso = "descripcion";
        return ctx.reply("Describe el objeto:");
    }

    if (r.paso === "descripcion" && msg) {
        r.desc = msg; r.paso = "movimiento";
        return ctx.reply("¿Movimiento?", Markup.keyboard([["SÍ", "NO", "ERRÁTICO"]]).resize());
    }

    if (r.paso === "movimiento" && msg) {
        r.mov = msg; r.paso = "confirmar";
        return ctx.reply("✅ Listo para el despliegue.", Markup.keyboard([["🚀 FINALIZAR Y PUBLICAR"], ["❌ CANCELAR"]]).resize());
    }
});

async function finalizarReporte(ctx, r) {
    const id = ctx.from.id;
    if (!DB.agentes[id]) DB.agentes[id] = { nombre: ctx.from.first_name, reportes: 0 };
    DB.agentes[id].reportes++;

    const nuevo = {
        lat: parseFloat(r.lat) || 0,
        lng: parseFloat(r.lng) || 0,
        pais: r.pais || "Desconocido",
        ciudad: r.ciudad || "S/D",
        barrio: r.barrio || "",
        fecha: new Date().toISOString(),
        descripcion: r.desc,
        movimiento: r.mov,
        agente: ctx.from.first_name
    };

    DB.reportes.push(nuevo);
    guardarDB();
    emitirRadar(nuevo); // <--- ESTO ENVÍA EL PUNTO AL MAPA AL INSTANTE

    const mensaje = `🚨 <b>NUEVO AVISTAMIENTO</b>\n\n📍 ${nuevo.barrio ? nuevo.barrio + ', ' : ''}${nuevo.ciudad}, ${nuevo.pais}\n👤 Agente: ${nuevo.agente}\n🚀 Movimiento: ${nuevo.movimiento}\n\n📝 ${nuevo.descripcion}`;

    let destinos = [RED_AIFU.ID_CONO_SUR];
    const p = nuevo.pais.toLowerCase();
    if (p.includes("uruguay")) destinos.push(RED_AIFU.ID_UY);
    else if (p.includes("argentina")) destinos.push(RED_AIFU.ID_AR);
    else if (p.includes("chile")) destinos.push(RED_AIFU.ID_CH);
    else destinos.push(RED_AIFU.ID_GLOBAL);

    for (const d of destinos) {
        try { await bot.telegram.sendMessage(d, mensaje, { parse_mode: 'HTML' }); } catch (e) {}
    }

    ctx.session = null;
    return ctx.reply("✅ Reporte publicado y transmitido al radar.", menuPrincipal());
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("AIFUCITO COMPLETO Y ONLINE"));
bot.launch();
