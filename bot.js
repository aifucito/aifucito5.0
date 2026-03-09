const { Telegraf, Markup } = require('telegraf');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const express = require('express');
require('dotenv').config();

// Configuración del servidor para Render
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('AIFUCITO 5.0 - RADAR ACTIVO'));
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));

// Inicialización del Bot
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "Eres AIFUCITO, experto técnico de AIFU Uruguay. Tu misión es obtener datos de trayectoria, tamaño y sonidos. Clasifica en: Nave, Fenómeno Luminoso o Paranormal."
});

let sesiones = {};

const menuPrincipal = () => Markup.keyboard([
    ['🛸 Reportar Avistamiento', '🗺️ Ver Mapa'],
    ['👤 Mi Perfil', '👽 Charlar con AIFUCITO'],
    ['💳 Hazte Socio / VIP', 'ℹ️ Información AIFU']
]).resize();

bot.start((ctx) => ctx.reply(`¡Hola ${ctx.from.first_name}! AIFUCITO 5.0 listo para investigar.`, menuPrincipal()));

// --- FLUJO DE REPORTE ---
bot.hears('🛸 Reportar Avistamiento', ctx => {
    sesiones[ctx.from.id] = { paso: 'pregunta_gps', datos: { fotos: [] } };
    ctx.reply("🛸 **INICIANDO FICHA TÉCNICA AIFU**\n\n¿Usar ubicación GPS?", 
        Markup.keyboard([['✅ Sí, usar GPS', '❌ No, manual'], ['Cancelar']]).resize().oneTime());
});

bot.on(['text', 'location', 'photo'], async (ctx, next) => {
    const id = ctx.from.id;
    const s = sesiones[id];
    if (!s) return next();

    const txt = ctx.message.text;
    if (txt === 'Cancelar') { delete sesiones[id]; return ctx.reply("❌ Cancelado.", menuPrincipal()); }

    // Ubicación
    if (s.paso === 'pregunta_gps') {
        if (txt === '✅ Sí, usar GPS') {
            s.paso = 'esperando_gps';
            return ctx.reply("📍 Presiona el botón:", Markup.keyboard([[Markup.button.locationRequest('📍 ENVIAR GPS')]]).resize());
        } else {
            s.paso = 'pais';
            return ctx.reply("1️⃣ **PAÍS:**", Markup.keyboard([['Uruguay', 'Argentina', 'Chile'], ['Otro (Global)', 'Cancelar']]).resize());
        }
    }

    if (s.paso === 'esperando_gps' && ctx.message.location) {
        s.datos.lat = ctx.message.location.latitude;
        s.datos.lng = ctx.message.location.longitude;
        s.datos.pais = "Uruguay"; 
        s.paso = 'descripcion';
        return ctx.reply("✅ GPS fijado. 👁️ **RELATO:** ¿Qué viste?");
    }

    if (s.paso === 'pais') { s.datos.pais = txt; s.paso = 'ciudad'; return ctx.reply("2️⃣ **CIUDAD/DEPTO:**"); }
    if (s.paso === 'ciudad') { s.datos.ciudad = txt; s.paso = 'barrio'; return ctx.reply("3️⃣ **BARRIO/ZONA:**"); }
    if (s.paso === 'barrio') { s.datos.barrio = txt; s.paso = 'referencia'; return ctx.reply("4️⃣ **REFERENCIA:**"); }
    if (s.paso === 'referencia') { s.datos.referencia = txt; s.paso = 'descripcion'; return ctx.reply("5️⃣ **DESCRIPCIÓN:** Cuéntame el evento."); }

    if (s.paso === 'descripcion') {
        s.datos.descripcion = txt;
        s.paso = 'multimedia';
        await ctx.sendChatAction('typing');
        try {
            const prompt = `Relato: "${txt}". Clasifica brevemente (Nave, Luz o Paranormal) y pide trayectoria y sonidos.`;
            const res = await model.generateContent(prompt);
            s.datos.analisis_ia = res.response.text();
            return ctx.reply(`🔍 **PERITAJE:**\n${s.datos.analisis_ia}\n\n📸 Envía fotos y luego pulsa '🚀 FINALIZAR'.`, 
                Markup.keyboard([['🚀 FINALIZAR'], ['Cancelar']]).resize());
        } catch (e) {
            return ctx.reply("📸 Envía fotos y luego pulsa '🚀 FINALIZAR'.");
        }
    }

    if (ctx.message.photo && s.paso === 'multimedia') {
        s.datos.fotos.push(ctx.message.photo[ctx.message.photo.length - 1].file_id);
        return ctx.reply("✅ Foto guardada.");
    }

    if (txt === '🚀 FINALIZAR') {
        await publicarReporte(s.datos, ctx); 
        delete sesiones[id];
        return ctx.reply("✅ Enviado al Radar AIFU.", menuPrincipal());
    }
});

async function publicarReporte(datos, ctx) {
    const CANALES = {
        "Uruguay": "-1003826671445", "Argentina": "-1003750025728", 
        "Chile": "-1003811532520", "Otro (Global)": "-1003820597313", "RadarConoSur": "-1003759731798"
    };
    const canalDestino = CANALES[datos.pais] || CANALES["Otro (Global)"];
    const ficha = `🛸 **REPORTE AIFU**\n👤 **POR:** ${ctx.from.first_name}\n📍 **LUGAR:** ${datos.pais} - ${datos.ciudad || ''}\n👁️ **RELATO:** ${datos.descripcion}\n🔍 **IA:** ${datos.analisis_ia || 'N/A'}`;

    try {
        for (const foto of datos.fotos) {
            await bot.telegram.sendPhoto(canalDestino, foto);
            await bot.telegram.sendPhoto(CANALES["RadarConoSur"], foto);
        }
        await bot.telegram.sendMessage(canalDestino, ficha);
        await bot.telegram.sendMessage(CANALES["RadarConoSur"], ficha);
    } catch (e) { console.log("Error envío:", e.message); }
}

bot.launch();
