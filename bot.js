import { Telegraf, Markup } from 'telegraf';
import { GoogleGenerativeAI } from "@google/generative-ai";
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

const DB_FILE = './base_datos_aifu.json';
const MAP_FILE = './reportes.json';

/* --- PERSISTENCIA Y RANGOS --- */
let db = { usuarios: {} };
if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE));
const guardarDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

const obtenerRango = (p) => {
    if (p < 30) return "🧽 Fajinador de Retretes Espaciales";
    if (p < 100) return "🧉 Cebador de Mate Intergaláctico";
    if (p < 250) return "👽 Traductor de Dialectos Marcianos";
    if (p < 500) return "🔭 Cazador de Luces de Boliche";
    if (p < 1000) return "🛸 Piloto de Plato Volador a Pedal";
    return "👨‍🚀 COMANDANTE ESPACIAL AIFULOGO";
};

/* --- SERVIDOR WEB (Ruta del Respaldo) --- */
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/reportes.json', (req, res) => {
    res.json(fs.existsSync(MAP_FILE) ? JSON.parse(fs.readFileSync(MAP_FILE)) : []);
});
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 RADAR AIFU ACTIVO EN PUERTO ${PORT}`));

/* --- GEOLOCALIZACIÓN INVERSA --- */
async function obtenerDireccion(lat, lon) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`, {
            headers: { 'User-Agent': 'AIFU_Bot_Uruguay' }
        });
        const data = await response.json();
        return data.display_name || "Ubicación detectada";
    } catch (e) { return "Coordenadas GPS"; }
}

/* --- BOT Y CANALES --- */
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const CANALES = {
    "Uruguay": { id: "-1003826671445", link: "https://t.me/+nCVD4NsOihIyNGFh" },
    "Argentina": { id: "-1003750025728", link: "https://t.me/+QpErPk26SY05OGIx" },
    "Chile": { id: "-1003811532520", link: "https://t.me/+VP2T47eLvIowNmYx" },
    "Global": { id: "-1003820597313", link: "https://t.me/+r5XfcJma3g03MWZh" },
    "Central": { id: "-1003759731798" }
};

let sesiones = {};

const menuPrincipal = () => Markup.keyboard([
    ['🛸 Reportar Avistamiento', '🗺️ Ver Mapa Táctico'],
    ['🎖️ Mi Rango de Investigador', '🔗 Red de Canales'],
    ['ℹ️ Sobre AIFU']
]).resize();

bot.start((ctx) => {
    if (!db.usuarios[ctx.from.id]) db.usuarios[ctx.from.id] = { nombre: ctx.from.first_name, puntos: 0, reportes: 0 };
    guardarDB();
    ctx.reply(`🛸 AIFUCITO 5.0 Conectado.\nInvestigador: ${ctx.from.first_name}`, menuPrincipal());
});

bot.hears('🔗 Red de Canales', (ctx) => {
    ctx.reply(`🌍 **RED DE TELEGRAM AIFU:**\n\n🇺🇾 [Uruguay](${CANALES.Uruguay.link})\n🇦🇷 [Argentina](${CANALES.Argentina.link})\n🇨🇱 [Chile](${CANALES.Chile.link})\n🌐 [Global](${CANALES.Global.link})`, { parse_mode: 'Markdown' });
});

bot.hears('🗺️ Ver Mapa Táctico', (ctx) => {
    ctx.reply(`🛰️ ACCESO AL RADAR:\nhttps://aifucito5-0.onrender.com`);
});

bot.hears('🛸 Reportar Avistamiento', (ctx) => {
    sesiones[ctx.from.id] = { paso: 'pais', datos: { fotos: [] } };
    ctx.reply("🌎 ¿País del evento?", Markup.keyboard([['Uruguay', 'Argentina', 'Chile'], ['Otro'], ['❌ Cancelar']]).resize());
});

bot.on(['text', 'location', 'photo'], async (ctx, next) => {
    const s = sesiones[ctx.from.id];
    if (!s) return next();
    const txt = ctx.message.text;

    if (txt === '❌ Cancelar') { delete sesiones[ctx.from.id]; return ctx.reply("Abortado.", menuPrincipal()); }

    if (s.paso === 'pais') {
        s.datos.pais = txt; s.paso = 'gps';
        return ctx.reply("📍 Mandá ubicación GPS para el mapa:", Markup.keyboard([[Markup.button.locationRequest('📍 ENVIAR UBICACIÓN')], ['Omitir GPS']]).resize());
    }

    if (s.paso === 'gps') {
        if (ctx.message.location) {
            s.datos.lat = ctx.message.location.latitude;
            s.datos.lng = ctx.message.location.longitude;
            s.datos.direccion = await obtenerDireccion(s.datos.lat, s.datos.lng);
            ctx.reply(`✅ Localizado: ${s.datos.direccion}`);
        } else { s.datos.direccion = "Ubicación manual"; }
        s.paso = 'descripcion';
        return ctx.reply("👁️ ¿Qué viste? (Descripción):", Markup.removeKeyboard());
    }

    if (s.paso === 'descripcion') {
        s.datos.descripcion = txt;
        const res = await model.generateContent(`Analiza este reporte OVNI de forma breve: ${txt}`);
        s.datos.analisis = res.response.text().trim();
        s.paso = 'fotos';
        return ctx.reply(`${s.datos.analisis}\n\n📸 Mandá fotos y tocá '🚀 FINALIZAR'.`, Markup.keyboard([['🚀 FINALIZAR']]).resize());
    }

    if (ctx.message.photo && s.paso === 'fotos') {
        s.datos.fotos.push(ctx.message.photo.pop().file_id);
        return ctx.reply("✅ Foto añadida.");
    }

    if (txt === '🚀 FINALIZAR') {
        const destino = CANALES[s.datos.pais] || CANALES.Global;
        const ficha = `🛸 **REPORTE AIFU**\n📍 ${s.datos.direccion}\n📝 ${s.datos.descripcion}\n🔍 ${s.datos.analisis}`;
        
        try {
            for (const f of s.datos.fotos) {
                await bot.telegram.sendPhoto(destino.id, f);
                await bot.telegram.sendPhoto(CANALES.Central.id, f);
            }
            await bot.telegram.sendMessage(destino.id, ficha);
            await bot.telegram.sendMessage(CANALES.Central.id, ficha);

            let puntos = fs.existsSync(MAP_FILE) ? JSON.parse(fs.readFileSync(MAP_FILE)) : [];
            puntos.push({ lat: s.datos.lat || -34.6, lng: s.datos.lng || -58.4, lugar: s.datos.direccion, descripcion: s.datos.descripcion });
            fs.writeFileSync(MAP_FILE, JSON.stringify(puntos));

            db.usuarios[ctx.from.id].puntos += 20;
            guardarDB();
            ctx.reply(`✅ ENVIADO AL CANAL ${s.datos.pais.toUpperCase()}.\nTu rango: ${obtenerRango(db.usuarios[ctx.from.id].puntos)}`, menuPrincipal());
        } catch (e) { ctx.reply("Error al enviar."); }
        delete sesiones[ctx.from.id];
    }
});

bot.launch();
