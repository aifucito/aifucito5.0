// ==========================================
// AIFUCITO 5.0 - INVESTIGADOR JEFE AIFU
// ==========================================
import { Telegraf, Markup } from 'telegraf';
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';
import express from 'express';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('AIFUCITO 5.0 - PERITAJE ACTIVO'));
app.listen(PORT, () => console.log(`AIFUCITO en línea`));

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "Eres AIFUCITO, experto de AIFU Uruguay. Clasifica eventos en: Nave (Plato/Cigarro/Triángulo), Fenómeno Luminoso o Paranormal (Duende/Fantasma/Espíritu). Sé técnico."
});

let sesiones = {}; 

const menuPrincipal = () => Markup.keyboard([
    ['🛸 Reportar Avistamiento', '🗺️ Ver Mapa'],
    ['👤 Mi Perfil', '👽 Charlar con AIFUCITO'],
    ['💳 Hazte Socio / VIP', 'ℹ️ Información AIFU']
]).resize();

bot.hears('🛸 Reportar Avistamiento', ctx => {
    sesiones[ctx.from.id] = { paso: 'pregunta_gps', datos: { fotos: [] } };
    ctx.reply("🛸 **INICIANDO FICHA TÉCNICA AIFU**\n\n¿Deseas usar tu ubicación GPS?", 
        Markup.keyboard([['✅ Sí, usar GPS', '❌ No, manual'], ['Cancelar']]).resize().oneTime());
});

bot.on(['text', 'location', 'photo'], async (ctx, next) => {
    const id = ctx.from.id;
    const s = sesiones[id];
    if (!s) return next();

    if (ctx.message.text === 'Cancelar') { delete sesiones[id]; return ctx.reply("❌ Cancelado.", menuPrincipal()); }

    // --- PASOS DE UBICACIÓN ---
    if (s.paso === 'pregunta_gps') {
        if (ctx.message.text === '✅ Sí, usar GPS') {
            s.paso = 'esperando_gps';
            return ctx.reply("📍 Envía tu posición GPS:", Markup.keyboard([[Markup.button.locationRequest('📍 ENVIAR GPS')]]).resize());
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
        return ctx.reply("✅ GPS fijado.\n\n👁️ **RELATO INICIAL:** ¿Qué observaste?");
    }

    if (s.paso === 'pais') { s.datos.pais = ctx.message.text; s.paso = 'ciudad'; return ctx.reply("2️⃣ **DEPARTAMENTO / PROVINCIA:**"); }
    if (s.paso === 'ciudad') { s.datos.ciudad = ctx.message.text; s.paso = 'barrio'; return ctx.reply("3️⃣ **CIUDAD O BARRIO:**"); }
    if (s.paso === 'barrio') { s.datos.barrio = ctx.message.text; s.paso = 'referencia'; return ctx.reply("4️⃣ **REFERENCIA CERCANA:**"); }
    if (s.paso === 'referencia') { s.datos.referencia = ctx.message.text; s.paso = 'descripcion'; return ctx.reply("5️⃣ **RELATO:** Cuéntame el evento con detalle."); }

    // --- INTERROGATORIO Y CLASIFICACIÓN IA ---
    if (s.paso === 'descripcion') {
        s.datos.descripcion = ctx.message.text;
        s.paso = 'multimedia';
        await ctx.sendChatAction('typing');
        try {
            const prompt = `Analiza este relato: "${ctx.message.text}". 
            1. Clasifica el evento (Nave, Luz, Paranormal/Entidad). 
            2. Pide al testigo: Trayectoria, tamaño y si hubo sonidos o efectos físicos.`;
            const res = await model.generateContent(prompt);
            s.datos.analisis_ia = res.response.text();
            return ctx.reply(`🔍 **ANÁLISIS TÉCNICO PRELIMINAR:**\n\n${s.datos.analisis_ia}\n\n📸 **EVIDENCIA:** Envía tus fotos/videos ahora y luego pulsa '🚀 FINALIZAR'.`, 
                Markup.keyboard([['🚀 FINALIZAR'], ['Cancelar']]).resize());
        } catch (e) {
            s.datos.analisis_ia = "Pendiente de clasificación técnica.";
            return ctx.reply("📸 **EVIDENCIA:** Envía tus fotos/videos y luego pulsa '🚀 FINALIZAR'.");
        }
    }

    // CAPTURA DE FOTOS
    if (ctx.message.photo && s.paso === 'multimedia') {
        const fotoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        s.datos.fotos.push(fotoId);
        return ctx.reply("✅ Archivo recibido correctamente.");
    }

    if (ctx.message.text === '🚀 FINALIZAR') {
        await publicarReporte(s.datos, ctx); 
        delete sesiones[id];
        return ctx.reply("✅ **REPORTE CLASIFICADO Y DIFUNDIDO POR AIFU**", menuPrincipal());
    }
});

async function publicarReporte(datos, ctx) {
    const CANALES = {
        "Uruguay": "-1003826671445", "Argentina": "-1003750025728", 
        "Chile": "-1003811532520", "Otro (Global)": "-1003820597313", "RadarConoSur": "-1003759731798"
    };
    
    const canalDestino = CANALES[datos.pais] || CANALES["Otro (Global)"];
    const ficha = `🛸 **ALERTA AIFU: REPORTE CLASIFICADO**\n━━━━━━━━━━━━\n👤 **POR:** ${ctx.from.first_name}\n📍 **LUGAR:** ${datos.pais} - ${datos.ciudad || ''}\n━━━━━━━━━━━━\n👁️ **RELATO:**\n"${datos.descripcion}"\n\n🔍 **PERITAJE DE AIFUCITO:**\n${datos.analisis_ia || 'N/A'}`;

    try {
        // Enviar todas las fotos primero a ambos canales
        for (const foto of datos.fotos) {
            await bot.telegram.sendPhoto(canalDestino, foto);
            await bot.telegram.sendPhoto(CANALES["RadarConoSur"], foto);
        }
        // Enviar la ficha técnica
        await bot.telegram.sendMessage(canalDestino, ficha);
        await bot.telegram.sendMessage(CANALES["RadarConoSur"], ficha);
    } catch (e) { console.error("Error envío:", e.message); }
}

bot.launch();
