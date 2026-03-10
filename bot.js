import { Telegraf, Markup } from 'telegraf';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   SISTEMA DE ARCHIVOS (Modo Supervivencia)
========================= */
const DB_FILE = path.join(__dirname, 'base_datos_aifu.json');
const MAP_FILE = path.join(__dirname, 'reportes.json');

// Inicialización de archivos si no existen
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
   SISTEMA DE RANGOS GAMER
========================= */
const obtenerRango = (puntos) => {
    if (puntos >= 2000) return "👑 COMANDANTE INTERGALÁCTICO";
    if (puntos >= 1000) return "🛸 PILOTO DE CAZA UFOLÓGICO";
    if (puntos >= 500)  return "📡 OPERADOR DE RADAR TÁCTICO";
    if (puntos >= 200)  return "🔍 ANALISTA DE EVIDENCIA";
    if (puntos >= 50)   return "📸 CAZADOR DE LUCES";
    return "🧽 FAJINADOR DE NAVES ESPACIALES";
};

/* =========================
   SERVIDOR WEB PARA EL RADAR
========================= */
app.use(express.static(path.join(__dirname, 'public')));
app.get('/reportes.json', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(MAP_FILE);
});
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 RADAR ACTIVO EN PUERTO ${PORT}`));

/* =========================
   BOT TELEGRAM (AIFUCITO)
========================= */
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
let sesiones = {};

const CANALES = {
  Uruguay: "-1003826671445",
  Argentina: "-1003750025728",
  Chile: "-1003811532520",
  Global: "-1003820597313",
  Central: "-1003759731798"
};

const menuPrincipal = () => Markup.keyboard([
    ['🛸 Reportar Avistamiento', '🗺️ Radar Táctico'],
    ['🎖️ Mi Rango Investigador', '🔗 Red de Canales'],
    ['ℹ️ Sobre AIFU']
]).resize();

bot.start((ctx) => {
    const id = ctx.from.id;
    if (!db.usuarios[id]) {
        db.usuarios[id] = { nombre: ctx.from.first_name, puntos: 0, reportes: 0 };
        guardarDB();
    }
    ctx.reply(`🛸 Central AIFU Iniciada.\nInvestigador: ${ctx.from.first_name}\nRango: ${obtenerRango(db.usuarios[id].puntos)}`, menuPrincipal());
});

bot.hears('🗺️ Radar Táctico', (ctx) => {
    ctx.reply(`🛰️ ACCESO AL RADAR:\nhttps://aifucito5-0.onrender.com`);
});

bot.hears('🎖️ Mi Rango Investigador', (ctx) => {
    const user = db.usuarios[ctx.from.id] || { puntos: 0, reportes: 0, nombre: ctx.from.first_name };
    ctx.reply(`🚀 PERFIL DE MISIÓN\n━━━━━━━━━━━━━━\n👤 ${user.nombre}\n🎖️ Rango: ${obtenerRango(user.puntos)}\n📊 XP: ${user.puntos}\n🛸 Reportes: ${user.reportes}\n━━━━━━━━━━━━━━`);
});

bot.hears('🔗 Red de Canales', (ctx) => {
    ctx.reply(`📢 CANALES OFICIALES AIFU\n\n🇺🇾 Uruguay: https://t.me/+nCVD4NsOihIyNGFh\n🇦🇷 Argentina: https://t.me/+QpErPk26SY05OGIx\n🇨🇱 Chile: https://t.me/+VP2T47eLvIowNmYx\n🌎 Global: https://t.me/+r5XfcJma3g03MWZh`);
});

bot.hears('🛸 Reportar Avistamiento', (ctx) => {
    sesiones[ctx.from.id] = { paso: 'pais', datos: { fotos: [] } };
    ctx.reply("🌎 ¿País del suceso?", Markup.keyboard([['Uruguay', 'Argentina', 'Chile'], ['Otro'], ['❌ Cancelar']]).resize());
});

bot.on(['text', 'location', 'photo'], async (ctx, next) => {
    const id = ctx.from.id;
    const s = sesiones[id];
    if (!s) return next();

    if (ctx.message.text === '❌ Cancelar') { delete sesiones[id]; return ctx.reply("Abortado.", menuPrincipal()); }

    if (s.paso === 'pais') { s.datos.pais = ctx.message.text; s.paso = 'ciudad'; return ctx.reply("🏙️ Ciudad:"); }
    if (s.paso === 'ciudad') { s.datos.ciudad = ctx.message.text; s.paso = 'barrio'; return ctx.reply("🏠 Barrio/Zona:"); }
    if (s.paso === 'barrio') { 
        s.datos.barrio = ctx.message.text; s.paso = 'gps'; 
        return ctx.reply("📍 ¿Enviar GPS?", Markup.keyboard([[Markup.button.locationRequest('Mandar GPS')], ['Omitir'], ['❌ Cancelar']]).resize());
    }
    if (s.paso === 'gps') {
        if (ctx.message.location) { s.datos.lat = ctx.message.location.latitude; s.datos.lng = ctx.message.location.longitude; }
        s.paso = 'descripcion'; return ctx.reply("👁️ ¿Qué viste?");
    }
    if (s.paso === 'descripcion') { s.datos.descripcion = ctx.message.text; s.paso = 'fotos'; return ctx.reply("📸 Fotos y luego toca FINALIZAR.", Markup.keyboard([['🚀 FINALIZAR'], ['❌ Cancelar']]).resize()); }
    if (ctx.message.photo && s.paso === 'fotos') { s.datos.fotos.push(ctx.message.photo.pop().file_id); return ctx.reply("✅ Foto ok."); }

    if (ctx.message.text === '🚀 FINALIZAR') {
        const canal = CANALES[s.datos.pais] || CANALES.Global;
        const ficha = `🛸 REPORTE AIFU\n📍 ${s.datos.pais}, ${s.datos.ciudad}\n📝 ${s.datos.descripcion}`;
        
        try {
            for (const f of s.datos.fotos) await bot.telegram.sendPhoto(canal, f);
            await bot.telegram.sendMessage(canal, ficha);
            await bot.telegram.sendMessage(CANALES.Central, `🛰️ CENTRAL:\n${ficha}`);

            guardarReporteMapa(s.datos);
            db.usuarios[id].puntos += 25;
            db.usuarios[id].reportes += 1;
            guardarDB();

            ctx.reply(`✅ REPORTE ENVIADO.\nGanaste +25 XP.\nRango: ${obtenerRango(db.usuarios[id].puntos)}`, menuPrincipal());
        } catch (e) { ctx.reply("⚠️ Error al publicar."); }
        delete sesiones[id];
    }
});

bot.launch().then(() => console.log("📡 AIFU EN VIVO"));
