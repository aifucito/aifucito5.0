import { Telegraf, Markup } from 'telegraf';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch'; // Necesario para la API de Mapas
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

/* --- ARCHIVOS LOCALES --- */
const DB_FILE = path.join(__dirname, 'base_datos_aifu.json');
const MAP_FILE = path.join(__dirname, 'reportes.json');

if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ usuarios: {} }));
if (!fs.existsSync(MAP_FILE)) fs.writeFileSync(MAP_FILE, JSON.stringify([]));

let db = JSON.parse(fs.readFileSync(DB_FILE));
const guardarDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

const guardarReporteMapa = (reporte) => {
    let data = JSON.parse(fs.readFileSync(MAP_FILE));
    data.push({ ...reporte, id: Date.now(), fecha: new Date().toISOString() });
    fs.writeFileSync(MAP_FILE, JSON.stringify(data, null, 2));
};

/* --- FUNCIÓN DE TRADUCCIÓN GPS (Nominatim) --- */
async function obtenerDireccion(lat, lon) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`, {
            headers: { 'User-Agent': 'AIFUCITO-UFO-HUNTER' }
        });
        const data = await response.json();
        const a = data.address;
        // Armamos la dirección uruguaya: Calle/Barrio, Ciudad, Departamento
        return `${a.road || a.suburb || 'Zona Rural'}, ${a.city || a.town || a.village || 'Sin Ciudad'}, ${a.state || 'Uruguay'}`;
    } catch (e) {
        return "Coordenadas GPS (Sin nombre de calle)";
    }
}

const obtenerRango = (p) => {
    if (p >= 2000) return "👑 COMANDANTE INTERGALÁCTICO";
    if (p >= 1000) return "🛸 PILOTO DE CAZA UFOLÓGICO";
    if (p >= 500)  return "📡 OPERADOR DE RADAR TÁCTICO";
    if (p >= 200)  return "🔍 ANALISTA DE EVIDENCIA";
    if (p >= 50)   return "📸 CAZADOR DE LUCES";
    return "🧽 FAJINADOR DE NAVES ESPACIALES";
};

/* --- SERVIDOR WEB --- */
app.use(express.static(path.join(__dirname, 'public')));
app.get('/reportes.json', (req, res) => res.sendFile(MAP_FILE));
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 RADAR ACTIVO` ));

/* --- BOT LOGIC --- */
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
let sesiones = {};
const CANALES = { Uruguay: "-1003826671445", Argentina: "-1003750025728", Chile: "-1003811532520", Global: "-1003820597313", Central: "-1003759731798" };

const menuPrincipal = () => Markup.keyboard([['🛸 Reportar Avistamiento', '🗺️ Radar Táctico'],['🎖️ Mi Rango Investigador', '🔗 Red de Canales']]).resize();

bot.start((ctx) => {
    if (!db.usuarios[ctx.from.id]) { db.usuarios[ctx.from.id] = { nombre: ctx.from.first_name, puntos: 0, reportes: 0 }; guardarDB(); }
    ctx.reply(`🛸 Central AIFU Iniciada, ${ctx.from.first_name}.`, menuPrincipal());
});

bot.hears('🛸 Reportar Avistamiento', (ctx) => {
    sesiones[ctx.from.id] = { paso: 'lugar', datos: { fotos: [] } };
    ctx.reply("🌎 ¿En qué país ocurrió?", Markup.keyboard([['Uruguay', 'Argentina', 'Chile'], ['❌ Cancelar']]).resize());
});

bot.on(['text', 'location', 'photo'], async (ctx, next) => {
    const s = sesiones[ctx.from.id];
    if (!s) return next();
    const txt = ctx.message.text;

    if (txt === '❌ Cancelar') { delete sesiones[ctx.from.id]; return ctx.reply("Abortado.", menuPrincipal()); }

    if (s.paso === 'lugar') { s.datos.pais = txt; s.paso = 'gps'; 
        return ctx.reply("📍 Mandá ubicación GPS para el mapa:", Markup.keyboard([[Markup.button.locationRequest('📍 ENVIAR MI UBICACIÓN')], ['Omitir GPS']]).resize());
    }

    if (s.paso === 'gps') {
        if (ctx.message.location) {
            s.datos.lat = ctx.message.location.latitude;
            s.datos.lng = ctx.message.location.longitude;
            // ¡MAGIA! Traducimos coordenadas a nombre de lugar
            s.datos.direccionCorta = await obtenerDireccion(s.datos.lat, s.datos.lng);
            ctx.reply(`📍 Ubicación detectada:\n${s.datos.direccionCorta}`);
        } else {
            s.datos.direccionCorta = "Ubicación manual";
        }
        s.paso = 'descripcion';
        return ctx.reply("👁️ ¿Qué viste? (Descripción breve):", Markup.removeKeyboard());
    }

    if (s.paso === 'descripcion') { s.datos.descripcion = txt; s.paso = 'fotos'; return ctx.reply("📸 Mandá fotos y luego toca FINALIZAR.", Markup.keyboard([['🚀 FINALIZAR']]).resize()); }
    
    if (ctx.message.photo && s.paso === 'fotos') { s.datos.fotos.push(ctx.message.photo.pop().file_id); return ctx.reply("✅ Foto capturada."); }

    if (txt === '🚀 FINALIZAR') {
        const canal = CANALES[s.datos.pais] || CANALES.Global;
        const ficha = `🛸 REPORTE AIFU [${s.datos.pais.toUpperCase()}]\n📍 Lugar: ${s.datos.direccionCorta}\n📝 ${s.datos.descripcion}`;
        
        try {
            for (const f of s.datos.fotos) await bot.telegram.sendPhoto(canal, f);
            await bot.telegram.sendMessage(canal, ficha);
            await bot.telegram.sendMessage(CANALES.Central, `🛰️ CENTRAL:\n${ficha}`);

            guardarReporteMapa(s.datos);
            db.usuarios[ctx.from.id].puntos += 25;
            db.usuarios[ctx.from.id].reportes += 1;
            guardarDB();

            ctx.reply(`✅ REPORTE ENVIADO.\nGanaste +25 XP.\nRango: ${obtenerRango(db.usuarios[ctx.from.id].puntos)}`, menuPrincipal());
        } catch (e) { ctx.reply("⚠️ Error de señal."); }
        delete sesiones[ctx.from.id];
    }
});

bot.launch();
