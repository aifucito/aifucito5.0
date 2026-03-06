/**
 * ==================================================================================
 * 🛰️ AIFUCITO OMEGA v7.5 - SISTEMA DE INTELIGENCIA UNIFICADO (OPTIMIZADO)
 * COMPATIBILIDAD: package.json original | URL: https://aifucito5-0.onrender.com
 * ESTRUCTURA: Basada estrictamente en tu lógica de JSON.
 * ==================================================================================
 */

import { Telegraf, Markup, session } from 'telegraf';
import express from 'express';
import axios from 'axios'; 
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'aifucito_db.json');
const TOKEN = process.env.BOT_TOKEN || "8701174108:AAFgEE-uSZlDvrTNm_QIeDIINqmnCzQIOCM";
const PORT = process.env.PORT || 3000;
const PUBLIC_URL = "https://aifucito5-0.onrender.com";

// --- IDS DE CANALES PARA NOTIFICACIONES ---
const CANALES = {
    GLOBAL: "-1002388657640", // Radar Cono Sur
    URUGUAY: "-1002347230353",
    ARGENTINA: "-1002410312674",
    CHILE: "-1002283925519"
};

/**
 * ==================================================================================
 * [SISTEMA 1: MOTOR DE PERSISTENCIA (TU LÓGICA JSON)]
 * ==================================================================================
 */
class Persistence {
    constructor() {
        this.db = this.init();
        this.tokens = new Map();
    }
    init() {
        if (!fs.existsSync(DB_PATH)) {
            return { agentes: {}, reportes: [], config: { alerta: false } };
        }
        try {
            const data = fs.readFileSync(DB_PATH, 'utf8');
            return JSON.parse(data);
        } catch (err) {
            console.error("ERROR AL LEER DB:", err);
            return { agentes: {}, reportes: [], config: { alerta: false } };
        }
    }
    async sync() {
        try {
            await fs.promises.writeFile(DB_PATH, JSON.stringify(this.db, null, 2));
        } catch (err) {
            console.error("ERROR AL ESCRIBIR DB:", err);
        }
    }
}
const Core = new Persistence();

// --- Limpieza automática de tokens expirados cada 5 min ---
setInterval(() => {
    const now = Date.now();
    for (const [t, val] of Core.tokens.entries()) {
        if (val.exp < now) Core.tokens.delete(t);
    }
}, 300000);

/**
 * ==================================================================================
 * [SISTEMA 2: RADAR WEB DINÁMICO (PRIVADO)]
 * ==================================================================================
 */
const app = express();

app.get('/radar/:token', (req, res) => {
    const session = Core.tokens.get(req.params.token);
    if (!session || session.exp < Date.now()) return res.status(403).send("ACCESO EXPIRADO");

    const heatData = Core.db.reportes
        .filter(r => r.lat != null && r.lng != null)
        .map(r => [r.lat, r.lng, 0.8]);

    res.send(`
    <html>
    <head>
        <title>RADAR AIFU TÁCTICO</title>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <style>body{margin:0;background:#000}#map{height:100vh;filter:invert(1) hue-rotate(180deg)}</style>
    </head>
    <body>
        <div id="map"></div>
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <script src="https://leaflet.github.io/Leaflet.heat/dist/leaflet-heat.js"></script>
        <script>
            const map = L.map('map').setView([-34.6, -58.4], 5);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);
            const data = ${JSON.stringify(heatData)};
            L.heatLayer(data, {radius: 25, blur: 15}).addTo(map);
        </script>
    </body>
    </html>`);
});

app.get('/', (req, res) => res.send("🛰️ AIFUCITO NODE ONLINE"));

/**
 * ==================================================================================
 * [SISTEMA 3: LÓGICA DEL BOT (INTERFAZ PARA ADULTOS MAYORES)]
 * ==================================================================================
 */
const bot = new Telegraf(TOKEN);
bot.use(session());

const UI = {
    main: (user) => {
        const btns = [
            ['🛸 REPORTAR AVISTAMIENTO', '🌍 VER RADAR VIVO'],
            ['🤖 HABLAR CON AIFUCITO', '⭐ MI EXPEDIENTE']
        ];
        if (user.vip) btns.push(['📜 HISTORIAL VIP (EXCLUSIVO)']);
        return Markup.keyboard(btns).resize();
    },
    geo: Markup.keyboard([
        [Markup.button.locationRequest('📍 ENVIAR MI GPS (RECOMENDADO)')],
        ['✍️ ESCRIBIR LUGAR MANUAL'],
        ['❌ CANCELAR']
    ]).resize()
};

// --- MIDDLEWARE DE IDENTIFICACIÓN ---
bot.use(async (ctx, next) => {
    if (!ctx.from) return;
    const uid = ctx.from.id;
    if (!Core.db.agentes[uid]) {
        Core.db.agentes[uid] = { id: uid, nombre: ctx.from.first_name, xp: 0, vip: false, reportes: 0 };
        await Core.sync();
    }
    ctx.state.user = Core.db.agentes[uid];
    return next();
});

// --- COMANDOS Y ACCIONES ---
bot.start((ctx) => ctx.reply(`👽 BIENVENIDO, AGENTE ${ctx.from.first_name}.\n\nSelecciona una opción para comenzar la vigilancia.`, UI.main(ctx.state.user)));

bot.hears('🌍 VER RADAR VIVO', (ctx) => {
    const token = crypto.randomBytes(12).toString('hex');
    Core.tokens.set(token, { exp: Date.now() + 600000 });
    ctx.reply(`🔐 ACCESO PRIVADO AL RADAR:\n${PUBLIC_URL}/radar/${token}\n(Válido por 10 min)`);
});

bot.hears('🛸 REPORTAR AVISTAMIENTO', (ctx) => {
    ctx.session = { step: 'LOC' };
    ctx.reply("📍 ¿DÓNDE OCURRIÓ?\nPresiona el botón de abajo para enviar tu GPS o escribe el lugar.", UI.geo);
});

bot.on('location', async (ctx) => {
    if (ctx.session?.step !== 'LOC') return;
    ctx.session.lat = ctx.message.location.latitude;
    ctx.session.lng = ctx.message.location.longitude;
    ctx.session.step = 'DESC';
    ctx.reply("📝 ¿QUÉ VISTE?\nEscribe una descripción breve (luces, forma, movimiento):", Markup.keyboard([['❌ CANCELAR']]).resize());
});

bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    const user = ctx.state.user;

    if (text === '❌ CANCELAR') { ctx.session = null; return ctx.reply("Operación abortada.", UI.main(user)); }

    // Ubicación Manual
    if (ctx.session?.step === 'LOC') {
        ctx.session.manual = text;
        ctx.session.lat = null; // Marcamos como manual
        ctx.session.lng = null;
        ctx.session.step = 'DESC';
        return ctx.reply(`Ubicación registrada: ${text}. Ahora describe el fenómeno:`);
    }

    // Guardado Final y Notificación a Canales
    if (ctx.session?.step === 'DESC') {
        const reporte = {
            id: Date.now(),
            uid: user.id,
            lat: ctx.session.lat,
            lng: ctx.session.lng,
            lugar: ctx.session.manual || "GPS",
            desc: text,
            fecha: new Date().toLocaleString('es-UY')
        };

        Core.db.reportes.push(reporte);
        user.xp += 300;
        user.reportes++;
        await Core.sync();

        // Notificación a Canales (Uruguay/Argentina/Chile/Global)
        const msg = `🛸 **ALERTA DE AVISTAMIENTO**\n📍 Lugar: ${reporte.lugar}\n📝 Reporte: ${text}\n👤 Agente: ${user.nombre}\n📅 ${reporte.fecha}`;
        await Promise.allSettled(Object.values(CANALES).map(cid => bot.telegram.sendMessage(cid, msg)));

        ctx.reply(`✅ REPORTE ARCHIVADO.\nHas ganado +300 XP.\nDatos enviados a la red de canales AIFU.`, UI.main(user));
        ctx.session = null;
    } else if (!ctx.session && text.length > 3) {
        // Chat IA Avanzado (Aifucito responde usando su base de datos)
        try {
            const mood = Core.db.reportes.length > 50 ? "alerta" : "calma";
            ctx.reply(`🤖 **Aifucito:** Entiendo, Agente. En mi base de datos hay ${Core.db.reportes.length} casos. Mi estado actual es: ${mood}.`);
        } catch (err) {
            console.error("ERROR CHAT IA:", err);
            ctx.reply("🤖 **Aifucito:** Hubo un error al procesar tu mensaje.");
        }
    }
});

// --- LANZAMIENTO ---
app.listen(PORT, '0.0.0.0', () => {
    console.log("🛰️ CENTRAL ONLINE EN PUERTO " + PORT);
    bot.launch().then(() => console.log("🤖 BOT TELEGRAM LANZADO")).catch(err => console.error("ERROR BOT:", err));
});
