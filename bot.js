const { Telegraf, Markup } = require('telegraf');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const express = require('express');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('AIFUCITO 5.0 - SISTEMA COMPLETO'));
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "Eres AIFUCITO, el experto técnico de AIFU Uruguay. Tu misión es investigar reportes. Debes clasificar si es una Nave (Plato, Cigarro, Triángulo), un Fenómeno Luminoso o un Evento Paranormal (Duende, Fantasma, Espíritu). Tono profesional."
});

let sesiones = {};

const menuPrincipal = () => Markup.keyboard([
    ['🛸 Reportar Avistamiento', '🗺️ Ver Mapa'],
    ['👤 Mi Perfil', '👽 Charlar con AIFUCITO'],
    ['💳 Hazte Socio / VIP', 'ℹ️ Información AIFU']
]).resize();

bot.start((ctx) => ctx.reply(`¡Hola ${ctx.from.first_name}! Bienvenido a la central de AIFU. ¿Qué vamos a investigar hoy?`, menuPrincipal()));

// --- FUNCIONES SECUNDARIAS (LO QUE YA TENÍAMOS) ---
bot.hears('🗺️ Ver Mapa', (ctx) => ctx.reply("📍 El Mapa de Calor está en desarrollo. Pronto verás los puntos de avistamiento en tiempo real."));
bot.hears('👤 Mi Perfil', (ctx) => ctx.reply(`👤 **Perfil de Investigador**\nNombre: ${ctx.from.first_name}\nRango: Investigador de Campo\nReportes: 0`));
bot.hears('ℹ️ Información AIFU', (ctx) => ctx.reply("AIFU: Asociación de Investigadores de Fenómenos Uruguayos.\nContacto: aifuoficial@gmail.com"));
bot.hears('💳 Hazte Socio / VIP', (ctx) => ctx.reply("¡Gracias por apoyar! Las funciones VIP están abiertas para todos los colaboradores de la comunidad por el momento."));

// --- IA CONVERSACIONAL ---
bot.hears('👽 Charlar con AIFUCITO', (ctx) => {
    sesiones[ctx.from.id] = { paso: 'charla_ia' };
    ctx.reply("Dime, ¿qué duda tienes sobre ufología o el fenómeno paranormal?", Markup.keyboard([['Salir de la charla']]).resize());
});

// --- LÓGICA DE REPORTE Y PERITAJE ---
bot.hears('🛸 Reportar Avistamiento', ctx => {
    sesiones[ctx.from.id] = { paso: 'pregunta_gps', datos: { fotos: [] } };
    ctx.reply("🛸 **INICIANDO FICHA TÉCNICA AIFU**\n\n¿Usar ubicación GPS?", 
        Markup.keyboard([['✅ Sí', '❌ No'], ['Cancelar']]).resize().oneTime());
});

bot.on(['text', 'location', 'photo'], async (ctx) => {
    const id = ctx.from.id;
    const s = sesiones[id];
    if (!s) return;

    const txt = ctx.message.text;
    if (txt === 'Cancelar' || txt === 'Salir de la charla') { delete sesiones[id]; return ctx.reply("Volviendo al menú...", menuPrincipal()); }

    // Charla libre con IA
    if (s.paso === 'charla_ia') {
        const prompt = txt;
        const result = await model.generateContent(prompt);
        return ctx.reply(result.response.text());
    }

    // Proceso de Reporte
    if (s.paso === 'pregunta_gps') {
        if (txt === '✅ Sí') {
            s.paso = 'esperando_gps';
            return ctx.reply("📍 Envía tu GPS:", Markup.keyboard([[Markup.button.locationRequest('📍 ENVIAR GPS')]]).resize());
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
        const prompt = `Relato: "${txt}". Analiza si es Nave, Luz o Paranormal. Pide trayectoria y ruidos.`;
        const res = await model.generateContent(prompt);
        s.datos.analisis_ia = res.response.text();
        return ctx.reply(`🔍 **PERITAJE:**\n${s.datos.analisis_ia}\n\n📸 Envía fotos/videos y pulsa '🚀 FINALIZAR'.`, 
            Markup.keyboard([['🚀 FINALIZAR'], ['Cancelar']]).resize());
    }

    if (ctx.message.photo && s.paso === 'multimedia') {
        s.datos.fotos.push(ctx.message.photo[ctx.message.photo.length - 1].file_id);
        return ctx.reply("✅ Evidencia guardada.");
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
    const ficha = `🛸 **ALERTA: REPORTE CLASIFICADO**\n👤 **POR:** ${ctx.from.first_name}\n📍 **LUGAR:** ${datos.pais} - ${datos.ciudad || ''}\n👁️ **RELATO:** ${datos.descripcion}\n🔍 **PERITAJE IA:** ${datos.analisis_ia || 'N/A'}`;

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
