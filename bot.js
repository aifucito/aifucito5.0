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
   CONFIGURACIÓN DE DISCO PERSISTENTE
========================= */
const DATA_DIR = '/data';
let DB_FILE, MAP_FILE;

if (fs.existsSync(DATA_DIR)) {
    console.log("✅ DISCO PERSISTENTE DETECTADO (/data)");
    DB_FILE = path.join(DATA_DIR, 'base_datos_aifu.json');
    MAP_FILE = path.join(DATA_DIR, 'reportes.json');
} else {
    console.log("⚠️ MODO TEMPORAL: Los datos se borrarán al reiniciar.");
    DB_FILE = path.join(__dirname, 'base_datos_aifu.json');
    MAP_FILE = path.join(__dirname, 'reportes.json');
}

if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ usuarios: {} }));
if (!fs.existsSync(MAP_FILE)) fs.writeFileSync(MAP_FILE, JSON.stringify([]));

let db = JSON.parse(fs.readFileSync(DB_FILE));
const guardarDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

const guardarReporteMapa = (reporte) => {
    const data = JSON.parse(fs.readFileSync(MAP_FILE));
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
   SERVIDOR WEB RADAR
========================= */
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/reportes.json', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(MAP_FILE);
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 RADAR ACTIVO EN PUERTO ${PORT}`));

/* =========================
   BOT TELEGRAM (LÓGICA OPERATIVA)
========================= */
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
let sesiones = {};

const menuPrincipal = () =>
    Markup.keyboard([
        ['🛸 Reportar Avistamiento', '🗺️ Ver Mapa Táctico'],
        ['🎖️ Mi Rango de Investigador', '🔗 Red de Canales'],
        ['ℹ️ Sobre AIFU']
    ]).resize();

bot.start((ctx) => {
    const id = ctx.from.id;
    if (!db.usuarios[id]) {
        db.usuarios[id] = { nombre: ctx.from.first_name, puntos: 0, reportes: 0 };
        guardarDB();
    }
    ctx.reply(`🛸 ¡Bienvenido a la Central AIFU, ${ctx.from.first_name}!\nTu rango actual: ${obtenerRango(db.usuarios[id].puntos)}`, menuPrincipal());
});

bot.hears('🗺️ Ver Mapa Táctico', (ctx) => {
    ctx.reply(`🛰️ RADAR TÁCTICO EN VIVO\n🌎 https://aifucito5-0.onrender.com/index.html`);
});

bot.hears('🎖️ Mi Rango de Investigador', (ctx) => {
    const user = db.usuarios[ctx.from.id];
    const rango = obtenerRango(user.puntos);
    ctx.reply(`🚀 ESTADO DE LA MISIÓN\n━━━━━━━━━━━━━━\n👤 Investigador: ${user.nombre}\n🎖️ Rango: ${rango}\n📊 XP Total: ${user.puntos}\n🛸 Avistamientos: ${user.reportes}\n━━━━━━━━━━━━━━`);
});

bot.hears('🔗 Red de Canales', (ctx) => {
    ctx.reply(`📢 CANALES OFICIALES AIFU\n\n🇺🇾 Uruguay: https://t.me/+nCVD4NsOihIyNGFh\n🇦🇷 Argentina: https://t.me/+QpErPk26SY05OGIx\n🇨🇱 Chile: https://t.me/+VP2T47eLvIowNmYx\n🌎 Global: https://t.me/+r5XfcJma3g03MWZh`);
});

bot.hears('🛸 Reportar Avistamiento', (ctx) => {
    sesiones[ctx.from.id] = { paso: 'lugar', datos: { fotos: [] } };
    ctx.reply("🛸 ¿En qué país ocurrió?", Markup.keyboard([['Uruguay', 'Argentina', 'Chile'], ['Otro'], ['❌ Cancelar']]).resize());
});

bot.on(['text', 'location', 'photo'], async (ctx, next) => {
    const id = ctx.from.id;
    const s = sesiones[id];
    if (!s) return next();

    const txt = ctx.message.text;
    if (txt === '❌ Cancelar') { delete sesiones[id]; return ctx.reply("Operación abortada.", menuPrincipal()); }

    if (s.paso === 'lugar') {
        s.datos.pais = txt;
        s.paso = 'ciudad';
        return ctx.reply("📌 ¿En qué ciudad?");
    }
    if (s.paso === 'ciudad') {
        s.datos.ciudad = txt;
        s.paso = 'barrio';
        return ctx.reply("🏠 ¿Barrio o zona?");
    }
    if (s.paso === 'barrio') {
        s.datos.barrio = txt;
        s.paso = 'gps';
        return ctx.reply("📍 ¿Enviar ubicación GPS?", Markup.keyboard([[Markup.button.locationRequest('📍 ENVIAR GPS')], ['No tengo GPS'], ['❌ Cancelar']]).resize());
    }
    if (s.paso === 'gps') {
        if (ctx.message.location) {
            s.datos.lat = ctx.message.location.latitude;
            s.datos.lng = ctx.message.location.longitude;
        }
        s.paso = 'descripcion';
        return ctx.reply("👁️ Describe lo ocurrido:", Markup.keyboard([['❌ Cancelar']]).resize());
    }
    if (s.paso === 'descripcion') {
        s.datos.descripcion = txt;
        s.paso = 'multimedia';
        return ctx.reply("📸 Envía fotos y luego toca FINALIZAR.", Markup.keyboard([['🚀 FINALIZAR'], ['❌ Cancelar']]).resize());
    }
    if (ctx.message.photo && s.paso === 'multimedia') {
        s.datos.fotos.push(ctx.message.photo.pop().file_id);
        return ctx.reply("✅ Foto añadida.");
    }
    if (txt === '🚀 FINALIZAR') {
        await publicarYGuardar(s.datos, ctx);
        delete sesiones[id];
    }
});

async function publicarYGuardar(datos, ctx) {
    const CANALES = { Uruguay: "-1003826671445", Argentina: "-1003750025728", Chile: "-1003811532520" };
    const canalDestino = CANALES[datos.pais] || "-1003820597313";
    const ficha = `🛸 REPORTE AIFU\n📍 ${datos.pais}, ${datos.ciudad}\n🏠 ${datos.barrio}\n📝 ${datos.descripcion}`;

    try {
        for (const f of datos.fotos) await bot.telegram.sendPhoto(canalDestino, f);
        await bot.telegram.sendMessage(canalDestino, ficha);
        await bot.telegram.sendMessage("-1003759731798", `🛰️ COPIA CENTRAL:\n${ficha}`);

        guardarReporteMapa(datos);
        
        const user = db.usuarios[ctx.from.id];
        user.puntos += 25;
        user.reportes += 1;
        guardarDB();

        ctx.reply(`✅ REPORTE ENVIADO.\nGanaste +25 XP.\nRango actual: ${obtenerRango(user.puntos)}`, menuPrincipal());
    } catch { ctx.reply("⚠️ Error al publicar en canales."); }
}

bot.launch().then(() => console.log("📡 AIFU OPERATIVO"));
