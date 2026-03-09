const { Telegraf, Markup } = require('telegraf');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const express = require('express');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('AIFUCITO 5.0 - CENTRAL AIFU ACTIVA'));
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Motor en marcha en puerto ${PORT}`));

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "Eres AIFUCITO, investigador de AIFU Uruguay. Tu tono es humano, de compañero, pero muy atento a los detalles. Clasifica eventos en: Nave (Plato/Cigarro/Triángulo), Fenómeno Luminoso o Paranormal (Duende/Entidad). Habla como un uruguayo apasionado por el misterio."
});

let sesiones = {};

const menuPrincipal = () => Markup.keyboard([
    ['🛸 Reportar algo raro', '🗺️ Mapa de Calor'],
    ['👤 Mi Perfil', '👽 Charlar un rato'],
    ['💳 Ser VIP / Colaborar', 'ℹ️ Sobre AIFU']
]).resize();

bot.start((ctx) => ctx.reply(`¡Buenas, ${ctx.from.first_name}! Soy AIFUCITO. Si viste algo extraño, vamos a registrarlo para AIFU. ¿Empezamos?`, menuPrincipal()));

// --- FLUJO DE REPORTE COMPLETO ---
bot.hears('🛸 Reportar algo raro', ctx => {
    sesiones[ctx.from.id] = { paso: 'pais', datos: { fotos: [] } };
    ctx.reply("¡Dale! Vamos con el registro. Decime primero, ¿en qué país estás?", 
        Markup.keyboard([['Uruguay', 'Argentina', 'Chile'], ['Otro (Global)', 'Cancelar']]).resize());
});

bot.on(['text', 'photo'], async (ctx) => {
    const id = ctx.from.id;
    const s = sesiones[id];
    if (!s) return;

    const txt = ctx.message.text;
    if (txt === 'Cancelar') { delete sesiones[id]; return ctx.reply("Entendido, cancelamos todo.", menuPrincipal()); }

    // 1. PAÍS -> CIUDAD
    if (s.paso === 'pais') { 
        s.datos.pais = txt; 
        s.paso = 'ciudad'; 
        return ctx.reply("¿En qué Departamento o Provincia fue?"); 
    }
    
    // 2. CIUDAD -> BARRIO
    if (s.paso === 'ciudad') { 
        s.datos.ciudad = txt; 
        s.paso = 'barrio'; 
        return ctx.reply("¿Y en qué ciudad, barrio o paraje exacto?"); 
    }

    // 3. BARRIO -> RELATO
    if (s.paso === 'barrio') { 
        s.datos.barrio = txt; 
        s.paso = 'descripcion'; 
        return ctx.reply("Bien. Ahora contame qué fue lo que viste. No te guardes nada, decime lo que te salió del alma."); 
    }

    // 4. RELATO -> MULTIMEDIA + ANÁLISIS IA
    if (s.paso === 'descripcion') {
        s.datos.descripcion = txt;
        s.paso = 'multimedia';
        await ctx.sendChatAction('typing');
        const prompt = `Analiza este relato: "${txt}". Identifica si es Nave, Luz o Paranormal. Da una respuesta humana y clasifica brevemente para AIFU.`;
        const res = await model.generateContent(prompt);
        s.datos.analisis_ia = res.response.text();
        return ctx.reply(`${s.datos.analisis_ia}\n\n📸 Si tenés fotos o videos del momento, mandalos ahora. Cuando termines, dale a '🚀 REVISAR REPORTE'.`, 
            Markup.keyboard([['🚀 REVISAR REPORTE'], ['Cancelar']]).resize());
    }

    // CAPTURA DE FOTOS
    if (ctx.message.photo && s.paso === 'multimedia') {
        s.datos.fotos.push(ctx.message.photo[ctx.message.photo.length - 1].file_id);
        return ctx.reply("✅ Evidencia guardada. ¿Alguna más?");
    }

    // 5. REVISIÓN Y APROBACIÓN DEL USUARIO
    if (txt === '🚀 REVISAR REPORTE' && s.paso === 'multimedia') {
        s.paso = 'confirmacion';
        const resumen = `📝 **RESUMEN DEL REPORTE**\n\n📍 **LUGAR:** ${s.datos.pais}, ${s.datos.ciudad}, ${s.datos.barrio}\n👁️ **RELATO:** ${s.datos.descripcion}\n🧠 **ANÁLISIS:** ${s.datos.analisis_ia}\n📸 **FOTOS:** ${s.datos.fotos.length}\n\n¿Está todo bien? Si le das a CONFIRMAR, se publica en los canales de AIFU.`;
        return ctx.reply(resumen, Markup.keyboard([['✅ CONFIRMAR Y ENVIAR', '❌ CORREGIR / CANCELAR']]).resize());
    }

    // 6. ENVÍO FINAL
    if (txt === '✅ CONFIRMAR Y ENVIAR' && s.paso === 'confirmacion') {
        const CANALES = {
            "Uruguay": "-1003826671445", "Argentina": "-1003750025728", 
            "Chile": "-1003811532520", "Otro (Global)": "-1003820597313", "RadarConoSur": "-1003759731798"
        };
        const canalDestino = CANALES[s.datos.pais] || CANALES["Otro (Global)"];
        const ficha = `🛸 **REPORTE OFICIAL AIFU**\n━━━━━━━━━━━━\n👤 **TESTIGO:** ${ctx.from.first_name}\n📍 **UBICACIÓN:** ${s.datos.pais} - ${s.datos.ciudad} (${s.datos.barrio})\n👁️ **RELATO:** ${s.datos.descripcion}\n\n🧠 **PERITAJE:**\n${s.datos.analisis_ia}`;

        try {
            for (const f of s.datos.fotos) {
                await bot.telegram.sendPhoto(canalDestino, f);
                await bot.telegram.sendPhoto(CANALES["RadarConoSur"], f);
            }
            await bot.telegram.sendMessage(canalDestino, ficha);
            await bot.telegram.sendMessage(CANALES["RadarConoSur"], ficha);
        } catch (e) { console.log(e); }

        delete sesiones[id];
        return ctx.reply("¡Buen trabajo! El reporte ya está en el Radar. Gracias por colaborar con AIFU.", menuPrincipal());
    }

    if (txt === '❌ CORREGIR / CANCELAR') {
        delete sesiones[id];
        return ctx.reply("Reporte descartado. Volvemos al inicio.", menuPrincipal());
    }
});

bot.launch().then(() => console.log("AIFUCITO 5.0 LISTO"));
