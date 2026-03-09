import { Telegraf, Markup } from 'telegraf';
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';
import express from 'express';
import 'dotenv/config';

// --- 1. CONFIGURACIÓN ESTRICTA ---
const app = express();
const PORT = process.env.PORT || 3000;

// Esto mantiene a Render feliz (el Health Check)
app.get('/', (req, res) => res.send('AIFUCITO 5.0 Activo y Vigilando el Cielo 🛸'));
app.listen(PORT, () => console.log(`Servidor Web en puerto ${PORT}`));

const BOT_TOKEN = process.env.TELEGRAM_TOKEN; 
const GEMINI_KEY = process.env.GEMINI_API_KEY;

if (!BOT_TOKEN || !GEMINI_KEY) {
    console.error("❌ ERROR: Faltan las variables TELEGRAM_TOKEN o GEMINI_API_KEY en Render.");
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const genAI = new GoogleGenerativeAI(GEMINI_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "Eres AIFUCITO, investigador de OVNIs. Analiza reportes y haz preguntas técnicas cortas."
});

// --- 2. BASE DE DATOS Y SESIONES ---
let data = { usuarios: [], reportes: [] };
const dataPath = './data.json';

try {
    if (fs.existsSync(dataPath)) {
        data = JSON.parse(fs.readFileSync(dataPath));
    }
} catch (e) { console.log("Error leyendo DB, iniciando limpia."); }

const guardar = () => fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
const RANGOS = ["Fajinero Espacial", "Recluta", "Cadete", "Explorador", "Investigador", "Oficial", "Comandante"];
let sesiones = {};

// --- 3. LÓGICA DEL BOT (LO QUE YA TENÍAMOS) ---
const menuPrincipal = () => Markup.keyboard([
    ['🛸 Reportar Avistamiento', '👤 Mi Perfil'],
    ['👽 Charlar con AIFUCITO']
]).resize();

bot.start(ctx => {
    let user = data.usuarios.find(u => u.id === ctx.from.id);
    if (!user) {
        user = { id: ctx.from.id, nombre: ctx.from.first_name, puntos: 0 };
        data.usuarios.push(user);
        guardar();
    }
    ctx.reply(`👽 ¡Bienvenido a AIFU!\nRango: ${RANGOS[Math.min(Math.floor(user.puntos/3), 6)]}`, menuPrincipal());
});

// --- EL INTERROGATORIO INTELIGENTE ---
bot.hears('🛸 Reportar Avistamiento', ctx => {
    sesiones[ctx.from.id] = { paso: 'ubicacion', datos: { fotos: [] } };
    ctx.reply("📍 ¿Dónde ocurrió? Envía GPS o escribe Ciudad/País.", 
        Markup.keyboard([[Markup.button.locationRequest('📍 Enviar GPS')], ['Cancelar']]).resize());
});

bot.on('location', ctx => {
    const s = sesiones[ctx.from.id];
    if (!s) return;
    s.datos.lat = ctx.message.location.latitude;
    s.datos.lng = ctx.message.location.longitude;
    s.paso = 'descripcion_inicial';
    ctx.reply("✅ GPS OK. ¿Qué viste exactamente?");
});

bot.on(['text', 'photo'], async (ctx, next) => {
    const id = ctx.from.id;
    const s = sesiones[id];
    if (!s) return next();

    if (s.paso === 'ubicacion' && ctx.message.text !== 'Cancelar') {
        s.datos.ubicacion = ctx.message.text;
        s.paso = 'descripcion_inicial';
        return ctx.reply("✅ Ubicación guardada. ¿Qué fenómeno viste?");
    }

    if (s.paso === 'descripcion_inicial') {
        s.datos.descripcion = ctx.message.text;
        s.paso = 'preguntas_ia';
        await ctx.sendChatAction('typing');
        const prompt = `Testigo dice: "${ctx.message.text}". Genera 2 preguntas técnicas cortas.`;
        const result = await model.generateContent(prompt);
        return ctx.reply(`Entendido. Una consulta:\n\n${result.response.text()}\n\n(Responde aquí)`);
    }

    if (s.paso === 'preguntas_ia') {
        s.datos.detalles = ctx.message.text;
        s.paso = 'multimedia';
        return ctx.reply("📸 Envía fotos o pulsa 'Finalizar'.", Markup.keyboard([['🚀 Finalizar']]).resize());
    }

    if (ctx.message.text === '🚀 Finalizar') {
        data.reportes.push({ id: Date.now(), userId: id, ...s.datos });
        const u = data.usuarios.find(u => u.id === id);
        if(u) u.puntos++;
        guardar();
        delete sesiones[id];
        return ctx.reply("✅ Reporte Archivador.", menuPrincipal());
    }
});

// Lanzamiento con manejo de errores
bot.launch().then(() => console.log("🤖 Telegram Bot Funcionando")).catch(err => console.error("Error lanzando bot:", err));

// Manejo de cierre elegante
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
