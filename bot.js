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
   CONFIGURACIÓN DE DISCO (Render Starter)
========================= */
const DATA_DIR = '/data';
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_FILE = path.join(DATA_DIR, 'base_datos_aifu.json');
const MAP_FILE = path.join(DATA_DIR, 'reportes.json');

if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ usuarios: {}, historias_vip: [] }));
if (!fs.existsSync(MAP_FILE)) fs.writeFileSync(MAP_FILE, JSON.stringify([]));

let db = JSON.parse(fs.readFileSync(DB_FILE));
const guardarDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

const guardarReporteMapa = (reporte) => {
    const data = JSON.parse(fs.readFileSync(MAP_FILE));
    data.push(reporte);
    fs.writeFileSync(MAP_FILE, JSON.stringify(data, null, 2));
};

/* =========================
   IA CON MEMORIA
========================= */
let memoriaIA = {};

async function llamarIA(mensaje, userId) {
    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) throw new Error("Falta GEMINI_API_KEY");

    if (!memoriaIA[userId]) memoriaIA[userId] = [];
    memoriaIA[userId].push({ role: "user", parts: [{ text: mensaje }] });

    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`;
    const payload = {
        contents: [
            { role: "user", parts: [{ text: "Eres AIFUCITO, asistente oficial de AIFU Uruguay. Respondé breve, con onda uruguaya y conocimiento ufológico. Sos el bot de Damián." }] },
            ...memoriaIA[userId]
        ]
    };

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const respuesta = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No pude generar respuesta.";
    memoriaIA[userId].push({ role: "model", parts: [{ text: respuesta }] });

    if (memoriaIA[userId].length > 15) memoriaIA[userId] = memoriaIA[userId].slice(-15);
    return respuesta;
}

/* =========================
   SERVIDOR WEB RADAR
========================= */
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/reportes.json', (req, res) => res.sendFile(MAP_FILE));

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 RADAR AIFU ACTIVO EN PUERTO ${PORT}`));

/* =========================
   BOT TELEGRAM
========================= */
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
let sesiones = {};

const menuPrincipal = () =>
    Markup.keyboard([
        ['🛸 Reportar Avistamiento', '🗺️ Ver Mapa Táctico'],
        ['🎖️ Mi Rango de Investigador', '👽 Charlar con AIFUCITO'],
        ['💳 Hazte Socio / VIP', '🔗 Red de Canales'],
        ['ℹ️ Sobre AIFU']
    ]).resize();

bot.start((ctx) => {
    const id = ctx.from.id;
    if (!db.usuarios[id]) db.usuarios[id] = { nombre: ctx.from.first_name, puntos: 0 };
    guardarDB();
    ctx.reply(`🛸 ¡Hola ${ctx.from.first_name}! Soy AIFUCITO.`, menuPrincipal());
});

bot.hears('🗺️ Ver Mapa Táctico', (ctx) => {
    ctx.reply(`🛰️ RADAR MUNDIAL AIFU\n🌎 ${process.env.RADAR_URL || "https://tu-radar.onrender.com"}`);
});

bot.hears('👽 Charlar con AIFUCITO', (ctx) => {
    sesiones[ctx.from.id] = { paso: 'charlar_ia' };
    ctx.reply("👽 MODO IA ACTIVADO.", Markup.keyboard([['❌ Cancelar']]).resize());
});

bot.hears('🛸 Reportar Avistamiento', (ctx) => {
    sesiones[ctx.from.id] = { paso: 'ubicacion_tipo', datos: { fotos: [], pais: "", ciudad: "", barrio: "", descripcion: "", lat: null, lng: null } };
    ctx.reply("🛸 Nuevo reporte. ¿Lugar?", Markup.keyboard([['📍 Enviar GPS', '✍️ Escribir lugar'], ['❌ Cancelar']]).resize());
});

/* =========================
   PROCESAMIENTO DE PASOS (LÓGICA COMPLETA)
========================= */
bot.on(['text', 'location', 'photo'], async (ctx, next) => {
    const id = ctx.from.id;
    const s = sesiones[id];
    const txt = ctx.message.text;

    if (txt === '❌ Cancelar') { delete sesiones[id]; return ctx.reply("Cancelado.", menuPrincipal()); }
    if (!s) return next();

    // MODO IA
    if (s.paso === 'charlar_ia') {
        try {
            await ctx.sendChatAction('typing');
            ctx.reply(await llamarIA(txt, id));
        } catch { ctx.reply("⚠️ Interferencia en la señal."); }
        return;
    }

    // FLUJO DE REPORTE
    if (s.paso === 'ubicacion_tipo') {
        if (txt === '📍 Enviar GPS') {
            s.paso = 'esperando_gps';
            return ctx.reply("Mandá GPS:", Markup.keyboard([[Markup.button.locationRequest('📍 MANDAR GPS')]]).resize());
        }
        s.paso = 'pais';
        return ctx.reply("¿País?", Markup.keyboard([['Uruguay', 'Argentina', 'Chile']]).resize());
    }

    if (s.paso === 'esperando_gps' && ctx.message.location) {
        s.datos.lat = ctx.message.location.latitude;
        s.datos.lng = ctx.message.location.longitude;
        s.datos.pais = "Uruguay";
        s.datos.ciudad = "GPS Detectado";
        s.datos.barrio = "Coordenadas Exactas";
        s.paso = 'descripcion';
        return ctx.reply("👁️ ¿Qué estás viendo ahora?");
    }

    if (s.paso === 'pais') { s.datos.pais = txt; s.paso = 'ciudad'; return ctx.reply("📌 Ciudad o Departamento:"); }
    if (s.paso === 'ciudad') { s.datos.ciudad = txt; s.paso = 'barrio'; return ctx.reply("🏠 Barrio o Zona:"); }
    if (s.paso === 'barrio') { s.datos.barrio = txt; s.paso = 'descripcion'; return ctx.reply("👁️ Describí el fenómeno:"); }

    if (s.paso === 'descripcion') {
        s.datos.descripcion = txt;
        s.paso = 'multimedia';
        return ctx.reply("📸 Mandá fotos si tenés, luego tocá 🚀 REVISAR.", Markup.keyboard([['🚀 REVISAR'], ['❌ Cancelar']]).resize());
    }

    if (ctx.message.photo && s.paso === 'multimedia') {
        s.datos.fotos.push(ctx.message.photo[ctx.message.photo.length - 1].file_id);
        return ctx.reply("✅ Foto añadida.");
    }

    if (txt === '🚀 REVISAR') {
        s.paso = 'confirmacion';
        return ctx.reply(`📋 FICHA DE REPORTE\n📍 País: ${s.datos.pais}\n🏙️ Ciudad: ${s.datos.ciudad}\n🏠 Barrio: ${s.datos.barrio}\n📝 Detalle: ${s.datos.descripcion}`, Markup.keyboard([['✅ ENVIAR AL RADAR', '❌ DESCARTAR']]).resize());
    }

    if (txt === '✅ ENVIAR AL RADAR') {
        await publicarYGuardar(s.datos, ctx);
        delete sesiones[id];
    }
});

/* =========================
   PUBLICAR REPORTE
========================= */
async function publicarYGuardar(datos, ctx) {
    const CANALES = { Uruguay: "-1003826671445", Argentina: "-1003750025728", Chile: "-1003811532520" };
    const canal = CANALES[datos.pais] || "-1003820597313";
    const ficha = `🛸 NUEVO REPORTE AIFU\n📍 ${datos.pais}, ${datos.ciudad}\n🏠 ${datos.barrio}\n📝 ${datos.descripcion}`;

    try {
        for (const f of datos.fotos) await bot.telegram.sendPhoto(canal, f);
        await bot.telegram.sendMessage(canal, ficha);
        await bot.telegram.sendMessage("-1003759731798", ficha);

        guardarReporteMapa({ ...datos, fecha: new Date() });
        if (db.usuarios[ctx.from.id]) db.usuarios[ctx.from.id].puntos += 10;
        guardarDB();

        ctx.reply("✅ Reporte enviado al radar.", menuPrincipal());
    } catch { ctx.reply("⚠️ Error al publicar."); }
}

bot.launch().then(() => console.log("📡 AIFUCITO volando alto..."));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
