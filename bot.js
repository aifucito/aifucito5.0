// ==========================================
// AIFUCITO 7.0 - RADAR TOTAL CONO SUR
// ==========================================
import { Telegraf, Markup } from 'telegraf';
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';
import express from 'express';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('AIFUCITO 7.0 - RADAR TOTAL ACTIVO'));
app.listen(PORT, () => console.log(`AIFUCITO patrullando...`));

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "Eres AIFUCITO, experto técnico de AIFU Uruguay. Tu misión es obtener datos de trayectoria, tamaño y sonidos de OVNIs/FANI. Tono profesional y serio."
});

let sesiones = {}; 

const menuPrincipal = () => Markup.keyboard([
    ['🛸 Reportar Avistamiento', '🗺️ Ver Mapa'],
    ['👤 Mi Perfil', '👽 Charlar con AIFUCITO'],
    ['💳 Hazte Socio / VIP', 'ℹ️ Información AIFU']
]).resize();

// --- LLAVE MAESTRA ---
bot.command('identificar', (ctx) => {
    ctx.reply(`🆔 ID DE ESTE CHAT: ${ctx.chat.id}`);
});

// --- PROCESO DE REPORTE ---
bot.hears('🛸 Reportar Avistamiento', ctx => {
    sesiones[ctx.from.id] = { paso: 'pregunta_gps', datos: { fotos: [] } };
    ctx.reply("🛸 **INICIANDO FICHA TÉCNICA AIFU**\n\n¿Deseas enviar tu ubicación por GPS?", 
        Markup.keyboard([['✅ Sí, usar GPS', '❌ No, manual'], ['Cancelar']]).resize().oneTime());
});

bot.on(['text', 'location', 'photo'], async (ctx, next) => {
    const id = ctx.from.id;
    const s = sesiones[id];
    if (!s) return next();

    const txt = ctx.message.text;
    if (txt === 'Cancelar') { delete sesiones[id]; return ctx.reply("❌ Reporte cancelado.", menuPrincipal()); }

    // --- UBICACIÓN ---
    if (s.paso === 'pregunta_gps') {
        if (txt === '✅ Sí, usar GPS') {
            s.paso = 'esperando_gps';
            return ctx.reply("📍 Presiona el botón de abajo:", Markup.keyboard([[Markup.button.locationRequest('📍 ENVIAR MI GPS')]]).resize());
        } else {
            s.paso = 'pais';
            return ctx.reply("1️⃣ **PAÍS:**", Markup.keyboard([['Uruguay', 'Argentina'], ['Chile', 'Otro (Global)'], ['Cancelar']]).resize());
        }
    }

    if (s.paso === 'esperando_gps' && ctx.message.location) {
        s.datos.lat = ctx.message.location.latitude;
        s.datos.lng = ctx.message.location.longitude;
        s.datos.pais = "Uruguay"; 
        s.paso = 'descripcion';
        return ctx.reply("✅ GPS fijado.\n\n👁️ **DESCRIBE EL FENÓMENO:**\n¿Qué viste y qué comportamiento tenía?");
    }

    if (s.paso === 'pais') { s.datos.pais = txt; s.paso = 'ciudad'; return ctx.reply("2️⃣ **DEPARTAMENTO O PROVINCIA:**"); }
    if (s.paso === 'ciudad') { s.datos.ciudad = txt; s.paso = 'barrio'; return ctx.reply("3️⃣ **CIUDAD O BARRIO ESPECÍFICO:**"); }
    if (s.paso === 'barrio') { s.datos.barrio = txt; s.paso = 'referencia'; return ctx.reply("4️⃣ **PUNTO DE REFERENCIA:** (O pon 'no')"); }
    if (s.paso === 'referencia') { s.datos.referencia = txt; s.paso = 'descripcion'; return ctx.reply("5️⃣ **DESCRIPCIÓN:** Cuéntame qué observaste."); }

    // --- INTERROGATORIO IA TÉCNICO ---
    if (s.paso === 'descripcion') {
        s.datos.descripcion = txt;
        s.paso = 'interrogatorio';
        await ctx.sendChatAction('typing');
        try {
            const prompt = `Testigo dice: "${txt}". Pide: Trayectoria (recta, zigzag), tamaño comparativo (Luna o moneda) y sonidos.`;
            const res = await model.generateContent(prompt);
            return ctx.reply(`🔍 **INTERROGATORIO TÉCNICO:**\n\n${res.response.text()}`);
        } catch (e) {
            return ctx.reply(`🔍 **INTERROGATORIO TÉCNICO:**\n\n¿Qué trayectoria seguía? ¿Tamaño aparente? ¿Emitía sonidos?`);
        }
    }

    if (s.paso === 'interrogatorio') {
        s.datos.detalles_ia = txt;
        s.paso = 'multimedia';
        return ctx.reply("📸 **EVIDENCIA:** Envía fotos/videos y luego pulsa '🚀 FINALIZAR'.", Markup.keyboard([['🚀 FINALIZAR'], ['Cancelar']]).resize());
    }

    if (ctx.message.photo && s.paso === 'multimedia') {
        s.datos.fotos.push(ctx.message.photo[ctx.message.photo.length - 1].file_id);
        return ctx.reply("✅ Recibido.");
    }

    if (txt === '🚀 FINALIZAR') {
        await publicarReporte(s.datos, ctx); 
        delete sesiones[id];
        return ctx.reply("✅ **REPORTE DIFUNDIDO POR LA RED AIFU**", menuPrincipal());
    }
});

// --- PUBLICADOR CENTRALIZADO ---
async function publicarReporte(datos, ctx) {
    const CANALES = {
        "Uruguay": "-1003826671445",   
        "Argentina": "-1003750025728", 
        "Chile": "-1003811532520",     
        "Otro (Global)": "-1003820597313",
        "RadarConoSur": "-1003759731798"
    };
    
    const canalDestino = CANALES[datos.pais] || CANALES["Otro (Global)"];
    const ficha = `🛸 **NUEVO REPORTE FANI AIFU**\n━━━━━━━━━━━━\n👤 **POR:** ${ctx.from.first_name}\n📍 **LUGAR:** ${datos.pais} - ${datos.ciudad || ''}\n🚩 **REFERENCIA:** ${datos.referencia || 'N/A'}\n━━━━━━━━━━━━\n👁️ **RELATO:**\n"${datos.descripcion}"\n\n🔍 **TÉCNICO:**\n${datos.detalles_ia || 'N/A'}`;

    try {
        // Enviar al país del reporte
        await bot.telegram.sendMessage(canalDestino, ficha);
        // Enviar SIEMPRE a la central Radar Cono Sur
        await bot.telegram.sendMessage(CANALES["RadarConoSur"], ficha);
    } catch (e) {
        console.error("Error envío:", e.message);
    }
}

bot.launch();
