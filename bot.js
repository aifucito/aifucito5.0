import "dotenv/config";
import { Telegraf, Markup, session } from "telegraf";
import express from "express";
import compression from "compression";
import fs from "fs";
import path from "path";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";

/* ===============================
   CONFIGURACIÓN
   =============================== */
const ADMIN_ID = "7662736311";
const RADAR_CONO_SUR = "-1002447915570";
const WEBAPP_URL = "https://aifucito5-0.onrender.com";

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
bot.use(session());

/* ===============================
   🔥 DETECTOR DE CANAL (CLAVE)
   =============================== */
bot.on("channel_post", (ctx) => {
    console.log("====== CANAL DETECTADO ======");
    console.log("ID:", ctx.channelPost.chat.id);
    console.log("TITULO:", ctx.channelPost.chat.title);
    console.log("=============================");
});

/* ===============================
   PERSISTENCIA
   =============================== */
const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const REPORTES_PATH = path.join(DATA_DIR, "reportes.json");
let DB_REPORTES = [];

function cargarDB() {
    try {
        if (fs.existsSync(REPORTES_PATH)) {
            DB_REPORTES = JSON.parse(fs.readFileSync(REPORTES_PATH, "utf-8"));
        }
    } catch {
        DB_REPORTES = [];
    }
}

function guardarDB() {
    fs.writeFileSync(REPORTES_PATH, JSON.stringify(DB_REPORTES, null, 2));
}

cargarDB();
setInterval(guardarDB, 30000);

/* ===============================
   START
   =============================== */
bot.start(ctx => {
    ctx.reply("🛸 AIFU BOT ONLINE", Markup.keyboard([
        ["🛸 GENERAR REPORTE", Markup.button.webApp("🌍 VER RADAR", WEBAPP_URL)]
    ]).resize());
});

/* ===============================
   REPORTE
   =============================== */
bot.hears("🛸 GENERAR REPORTE", ctx => {
    ctx.session.reporte = { id: uuidv4(), ts: Date.now() };
    ctx.reply("📍 Enviá tu ubicación", 
        Markup.keyboard([[Markup.button.locationRequest("📍 UBICACIÓN")]]).resize());
});

bot.on("location", ctx => {
    if (!ctx.session?.reporte) return;

    const r = ctx.session.reporte;
    r.lat = ctx.message.location.latitude;
    r.lon = ctx.message.location.longitude;

    ctx.session.esperandoDesc = true;
    ctx.reply("📝 Describí lo que viste:");
});

bot.on("text", async (ctx, next) => {
    if (!ctx.session?.esperandoDesc) return next();

    const r = ctx.session.reporte;
    r.descripcion = ctx.message.text;
    r.user = ctx.from.first_name;

    DB_REPORTES.push(r);
    guardarDB();

    await bot.telegram.sendMessage(RADAR_CONO_SUR,
        `🛸 REPORTE\n👤 ${r.user}\n📍 ${r.lat}, ${r.lon}\n📝 ${r.descripcion}`
    );

    ctx.reply("✅ Reporte enviado");
    ctx.session = null;
});

/* ===============================
   API PARA EL MAPA
   =============================== */
const app = express();
app.use(compression());
app.use(express.static("public"));

app.get("/radar-data", (req, res) => {
    const datos = DB_REPORTES.slice(-100).map(r => ({
        lat: r.lat,
        lon: r.lon,
        desc: r.descripcion
    }));
    res.json(datos);
});

/* ===============================
   SERVIDOR
   =============================== */
app.listen(process.env.PORT || 10000, () => {
    console.log("🌍 Web activa");
});

bot.launch();
