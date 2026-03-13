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

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let DB = { agentes: {}, reportes: [] };

if (fs.existsSync(DB_PATH)) {
    try {
        DB = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    } catch {
        console.log("DB iniciada vacía");
    }
}

function guardarDB() {
    fs.writeFileSync(DB_PATH, JSON.stringify(DB, null, 4));
}

/* ================================
   RADAR EN VIVO (SSE)
================================ */

let radarClientes = [];

function emitirRadar(reporte) {
    const data = `data: ${JSON.stringify(reporte)}\n\n`;
    radarClientes.forEach(cliente => {
        try {
            cliente.write(data);
        } catch {}
    });
}

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
   BOT
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
    ctx.reply("🛰️ AIFUCITO ONLINE - Sistema de Vigilancia Aeroespacial", menuPrincipal());
});

bot.hears("⭐ MI PERFIL", (ctx) => {
    const u = DB.agentes[ctx.from.id] || { nombre: ctx.from.first_name, reportes: 0 };
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
   FLUJO DE REPORTE
================================ */

bot.hears("🛸 GENERAR REPORTE", (ctx) => {
    ctx.session = { reporte: { paso: "ubicacion" } };

    ctx.reply("📍 ¿Cómo quieres indicar la ubicación?", Markup.keyboard([
        [Markup.button.locationRequest("📍 ENVIAR MI GPS")],
        ["⌨️ MANUAL (Escribir)"],
        ["❌ CANCELAR"]
    ]).resize());
});

bot.on(["location", "text"], async (ctx) => {

    if (!ctx.session?.reporte) return;

    const r = ctx.session.reporte;
    const msg = ctx.message.text;

    if (msg === "❌ CANCELAR") {
        ctx.session = null;
        return ctx.reply("Reporte cancelado.", menuPrincipal());
    }

    if (msg === "🚀 FINALIZAR Y PUBLICAR") {
        return finalizarReporte(ctx, r);
    }

    if (r.paso === "ubicacion") {

        if (ctx.message.location) {

            r.lat = ctx.message.location.latitude;
            r.lng = ctx.message.location.longitude;

            try {

                const g = await axios.get(
                    `https://us1.locationiq.com/v1/reverse.php?key=${LOCATION_IQ_KEY}&lat=${r.lat}&lon=${r.lng}&format=json`
                );

                r.pais = g.data.address.country || "Desconocido";
                r.ciudad = g.data.address.city || g.data.address.town || "S/D";
                r.barrio = g.data.address.suburb || "";

            } catch {
                r.pais = "Desconocido";
            }

            r.paso = "descripcion";

            return ctx.reply("📍 Ubicación fijada. ¿Qué viste en el cielo?", Markup.removeKeyboard());
        }

        if (msg === "⌨️ MANUAL (Escribir)") {
            r.paso = "pais";
            return ctx.reply("Escribe el PAÍS:", Markup.removeKeyboard());
        }
    }

    if (r.paso === "pais") {
        r.pais = msg;
        r.paso = "ciudad";
        return ctx.reply("Escribe la CIUDAD:");
    }

    if (r.paso === "ciudad") {
        r.ciudad = msg;
        r.paso = "barrio";
        return ctx.reply("Escribe el BARRIO (o 'No'):");
    }

    if (r.paso === "barrio") {

        r.barrio = msg.toLowerCase() === "no" ? "" : msg;

        try {

            const q = `${r.barrio} ${r.ciudad} ${r.pais}`;

            const g = await axios.get(
                `https://us1.locationiq.com/v1/search.php?key=${LOCATION_IQ_KEY}&q=${q}&format=json&limit=1`
            );

            r.lat = g.data[0].lat;
            r.lng = g.data[0].lon;

        } catch {
            r.lat = -34.6;
            r.lng = -58.4;
        }

        r.paso = "descripcion";

        return ctx.reply("¿Qué viste en el cielo?");
    }

    if (r.paso === "descripcion" && msg) {
        r.desc = msg;
        r.paso = "movimiento";

        return ctx.reply("¿Tenía movimiento?", Markup.keyboard([
            ["SÍ", "NO", "ERRÁTICO"]
        ]).resize());
    }

    if (r.paso === "movimiento" && msg) {

        r.mov = msg;
        r.paso = "confirmar";

        return ctx.reply("✅ Todo listo para el despliegue.",
            Markup.keyboard([
                ["🚀 FINALIZAR Y PUBLICAR"],
                ["❌ CANCELAR"]
            ]).resize());
    }

});

/* ================================
   FINALIZAR REPORTE
================================ */

async function finalizarReporte(ctx, r) {

    const u = DB.agentes[ctx.from.id] || { nombre: ctx.from.first_name };
    u.reportes = (u.reportes || 0) + 1;

    const nuevo = {

        lat: parseFloat(r.lat),
        lng: parseFloat(r.lng),

        pais: r.pais || "Desconocido",
        ciudad: r.ciudad || "S/D",
        barrio: r.barrio || "",

        fecha: new Date().toISOString(),

        descripcion: r.desc,
        movimiento: r.mov,
        agente: u.nombre
    };

    DB.reportes.push(nuevo);
    guardarDB();

    /* ENVÍA AL RADAR EN TIEMPO REAL */
    emitirRadar(nuevo);

    const mensaje =
`🚨 <b>NUEVO AVISTAMIENTO</b>

📍 ${nuevo.barrio ? nuevo.barrio + ', ' : ''}${nuevo.ciudad}, ${nuevo.pais}
👤 Agente: ${nuevo.agente}
🚀 Movimiento: ${nuevo.movimiento}

📝 ${nuevo.descripcion}`;

    let destinos = [RED_AIFU.ID_CONO_SUR];

    const p = nuevo.pais.toLowerCase();

    if (p.includes("uruguay")) destinos.push(RED_AIFU.ID_UY);
    else if (p.includes("argentina")) destinos.push(RED_AIFU.ID_AR);
    else if (p.includes("chile")) destinos.push(RED_AIFU.ID_CH);
    else destinos.push(RED_AIFU.ID_GLOBAL);

    for (const id of destinos) {
        try {
            await bot.telegram.sendMessage(id, mensaje, { parse_mode: 'HTML' });
        } catch {}
    }

    ctx.session = null;

    return ctx.reply("✅ Reporte publicado en la red AIFU.", menuPrincipal());
}

/* ================================
   SERVER API
================================ */

const app = express();

app.use(express.static("public"));

app.get("/api/reportes", (req, res) => {
    res.json(DB.reportes);
});

/* CANAL EN VIVO DEL RADAR */
app.get("/api/live", (req, res) => {

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    res.flushHeaders();

    radarClientes.push(res);

    req.on("close", () => {
        radarClientes = radarClientes.filter(c => c !== res);
    });

});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
    console.log("AIFUCITO ONLINE EN PUERTO " + PORT);
});

bot.launch();
