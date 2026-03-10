import { Telegraf, Markup } from 'telegraf';
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

/* =========================
   BASE DE DATOS (JSON LOCAL)
========================= */
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

/* =========================
   GEOLOCALIZACIÓN INVERSA
========================= */
async function obtenerDireccion(lat, lon) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`, {
            headers: { 'User-Agent': 'AIFU_Radar_Bot' }
        });
        const data = await response.json();
        const a = data.address;
        return `${a.road || a.suburb || 'Zona Detectada'}, ${a.city || a.town || a.village || 'Sin Ciudad'}, ${a.state || 'Región'}`;
    } catch (e) { return "Ubicación GPS (Coordenadas)"; }
}

/* =========================
   SISTEMA DE RANGOS
========================= */
const obtenerRango = (p) => {
    if (p >= 2000) return "👑 COMANDANTE INTERGALÁCTICO";
    if (p >= 1000) return "🛸 PILOTO DE CAZA UFOLÓGICO";
    if (p >= 500)  return "📡 OPERADOR DE RADAR TÁCTICO";
    if (p >= 200)  return "🔍 ANALISTA DE EVIDENCIA";
    if (p >= 50)   return "📸 CAZADOR DE LUCES";
    return "🧽 FAJINADOR DE NAVES ESPACIALES";
};

/* =========================
   SERVIDOR Y RADAR
========================= */
app.use(express.static(path.join(__dirname, 'public')));
app.get('/reportes.json', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(MAP_FILE);
});
app.listen(PORT, '0.0.0.0', () => console.log("🚀 RADAR AIFU ONLINE"));

/* =========================
   BOT TELEGRAM (CONFIGURACIÓN)
========================= */
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
let sesiones = {};

// RED DE CANALES OFICIAL
const CANALES = {
    Uruguay: { id: "-1003826671445", link: "https://t.me/+nCVD4NsOihIyNGFh" },
    Argentina: { id: "-1003750025728", link: "https://t.me/+QpErPk26SY05OGIx" },
    Chile: { id: "-1003811532520", link: "https://t.me/+VP2T47eLvIowNmYx" },
    Global: { id: "-1003820597313", link: "https://t.me/+r5XfcJma3g03MWZh" },
    Central: { id: "-1003759731798" }
};

const menuPrincipal = () => Markup.keyboard([
    ['🛸 Reportar Avistamiento', '🗺️ Radar Táctico'],
    ['🎖️ Mi Rango Investigador', '🔗 Red de Canales'],
    ['ℹ️ Sobre AIFU']
]).resize();

bot.start((ctx) => {
    if (!db.usuarios[ctx.from.id]) {
        db.usuarios[ctx.from.id] = { nombre: ctx.from.first_name, puntos: 0, reportes: 0 };
        guardarDB();
    }
    ctx.reply(`🛸 Central AIFU Iniciada.\nInvestigador: ${ctx.from.first_name}\nRango: ${obtenerRango(db.usuarios[ctx.from.id].puntos)}`, menuPrincipal());
});

bot.hears('🗺️ Radar Táctico', (ctx) => {
    ctx.reply(`🛰️ ACCESO AL RADAR EN VIVO (RENDER):\nhttps://aifucito5-0.onrender.com`);
});

bot.hears('🔗 Red de Canales', (ctx) => {
    ctx.reply(`📢 CANALES OFICIALES AIFU\n\n🇺🇾 Uruguay: ${CANALES.Uruguay.link}\n🇦🇷 Argentina: ${CANALES.Argentina.link}\n🇨🇱 Chile: ${CANALES.Chile.link}\n🌎 Global: ${CANALES.Global.link}`);
});

bot.hears('🎖️ Mi Rango Investigador', (ctx) => {
    const user = db.usuarios[ctx.from.id];
    ctx.reply(`🚀 PERFIL DE MISIÓN\n━━━━━━━━━━━━━━\n👤 ${user.nombre}\n🎖️ Rango: ${obtenerRango(user.puntos)}\n📊 XP: ${user.puntos}\n🛸 Reportes: ${user.reportes}\n━━━━━━━━━━━━━━`);
});

bot.hears('🛸 Reportar Avistamiento', (ctx) => {
    sesiones[ctx.from.id] = { paso: 'pais', datos: { fotos: [] } };
    ctx.reply("🌎 ¿País del evento?", Markup.keyboard([['Uruguay', 'Argentina', 'Chile'], ['Otro'], ['❌ Cancelar']]).resize());
});

/* =========================
   LÓGICA DE REPORTE (FLUJO)
========================= */
bot.on(['text', 'location', 'photo'], async (ctx, next) => {
    const s = sesiones[ctx.from.id];
    if (!s) return next();
    const txt = ctx.message.text;

    if (txt === '❌ Cancelar') { delete sesiones[ctx.from.id]; return ctx.reply("Abortado.", menuPrincipal()); }

    if (s.paso === 'pais') { s.datos.pais = txt; s.paso = 'gps'; 
        return ctx.reply("📍 Mandá ubicación GPS para el Radar Táctico:", Markup.keyboard([[Markup.button.locationRequest('📍 ENVIAR UBICACIÓN')], ['Omitir GPS']]).resize());
    }

    if (s.paso === 'gps') {
        if (ctx.message.location) {
            s.datos.lat = ctx.message.location.latitude;
            s.datos.lng = ctx.message.location.longitude;
            s.datos.lugar = await obtenerDireccion(s.datos.lat, s.datos.lng);
            ctx.reply(`✅ Localizado: ${s.datos.lugar}`);
        } else {
            s.datos.lugar = "Ubicación informada manualmente";
        }
        s.paso = 'descripcion';
        return ctx.reply("👁️ ¿Qué observaste? (Descripción corta):", Markup.removeKeyboard());
    }

    if (s.paso === 'descripcion') { s.datos.descripcion = txt; s.paso = 'fotos'; return ctx.reply("📸 Enviá fotos y luego tocá FINALIZAR.", Markup.keyboard([['🚀 FINALIZAR']]).resize()); }
    
    if (ctx.message.photo && s.paso === 'fotos') { s.datos.fotos.push(ctx.message.photo.pop().file_id); return ctx.reply("✅ Foto añadida."); }

    if (txt === '🚀 FINALIZAR') {
        const canalRef = CANALES[s.datos.pais] || CANALES.Global;
        const ficha = `🛸 REPORTE AIFU [${s.datos.pais.toUpperCase()}]\n📍 Lugar: ${s.datos.lugar}\n📝 ${s.datos.descripcion}`;
        
        try {
            for (const f of s.datos.fotos) await bot.telegram.sendPhoto(canalRef.id, f);
            await bot.telegram.sendMessage(canalRef.id, ficha);
            await bot.telegram.sendMessage(CANALES.Central.id, `🛰️ COPIA CENTRAL:\n${ficha}`);

            guardarReporteMapa(s.datos);
            db.usuarios[ctx.from.id].puntos += 25;
            db.usuarios[ctx.from.id].reportes += 1;
            guardarDB();

            ctx.reply(`✅ REPORTE ENVIADO AL RADAR.\nGanaste +25 XP.\nRango: ${obtenerRango(db.usuarios[ctx.from.id].puntos)}`, menuPrincipal());
        } catch (e) { ctx.reply("⚠️ Interferencia en la señal (Error al publicar)."); }
        delete sesiones[ctx.from.id];
    }
});

bot.launch();
