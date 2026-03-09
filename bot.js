// ==========================================
// MÓDULO 1: CONFIGURACIÓN Y SERVIDOR
// ==========================================
import { Telegraf, Markup } from 'telegraf';
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';
import express from 'express';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('AIFUCITO 5.0 - SISTEMA ACTIVO'));
app.listen(PORT, () => console.log(`AIFUCITO encendido en puerto ${PORT}`));

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "Eres AIFUCITO, investigador experto de AIFU Uruguay. Tu tono es serio, técnico y amable."
});

// --- BASE DE DATOS Y RANGOS ---
let data = { usuarios: [], reportes: [] };
const dataPath = './data.json';
if (fs.existsSync(dataPath)) {
    try { data = JSON.parse(fs.readFileSync(dataPath)); } catch (e) { console.log("Iniciando DB"); }
}
const guardar = () => fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));

const RANGOS = ["Fajinero Espacial", "Recluta", "Cadete", "Explorador", "Investigador", "Oficial", "Comandante"];
let sesiones = {}; 
let sesionesChat = {};

// ==========================================
// MÓDULO 2: MENÚS Y FUNCIONES BÁSICAS
// ==========================================
const menuPrincipal = () => Markup.keyboard([
    ['🛸 Reportar Avistamiento', '🗺️ Ver Mapa'],
    ['👤 Mi Perfil', '👽 Charlar con AIFUCITO'],
    ['💳 Hazte Socio / VIP', 'ℹ️ Información AIFU']
]).resize();

bot.start(ctx => {
    let user = data.usuarios.find(u => u.id === ctx.from.id);
    if (!user) {
        user = { id: ctx.from.id, nombre: ctx.from.first_name, puntos: 0, vip: false };
        data.usuarios.push(user);
        guardar();
    }
    ctx.reply(`👽 ¡Bienvenido a AIFU, ${user.nombre}!\nTu rango actual: ${RANGOS[Math.min(Math.floor(user.puntos/3), 6)]}`, menuPrincipal());
});

bot.hears('👤 Mi Perfil', ctx => {
    const user = data.usuarios.find(u => u.id === ctx.from.id);
    ctx.reply(`👤 **EXPEDIENTE AIFU**\n\nNombre: ${user.nombre}\nPuntos: ${user.puntos}\nRango: ${RANGOS[Math.min(Math.floor(user.puntos/3), 6)]}`);
});

bot.hears('ℹ️ Información AIFU', ctx => {
    ctx.reply("🛸 **AIFU (Investigación Ufológica)**\nEstudio de FANI/UAP en el Cono Sur.\nPresidente: Damián.");
});

bot.hears('💳 Hazte Socio / VIP', ctx => {
    ctx.reply("🌟 **SÉ SOCIO AIFU**\nAcceso a Radar Multimedia y Mapa de Calor.\nContacto: aifuoficial@gmail.com");
});

bot.hears('🗺️ Ver Mapa', ctx => {
    ctx.reply("📍 **RADAR AIFU**\nConsulta el mapa general en nuestra web.");
});

// ==========================================
// MÓDULO 4 Y 5: GESTIÓN DE REPORTES (UNIFICADO)
// ==========================================
bot.hears('🛸 Reportar Avistamiento', ctx => {
    sesiones[ctx.from.id] = { paso: 'pregunta_gps', datos: { fotos: [] } };
    ctx.reply("🛸 **INICIANDO REPORTE**\n\n¿Deseas enviar tu ubicación por GPS?", 
        Markup.keyboard([['✅ Sí, usar GPS', '❌ No, manual'], ['Cancelar']]).resize().oneTime());
});

bot.on(['text', 'location', 'photo'], async (ctx, next) => {
    const id = ctx.from.id;
    const s = sesiones[id];
    if (!s) return next();

    const txt = ctx.message.text;
    if (txt === 'Cancelar') { delete sesiones[id]; return ctx.reply("❌ Reporte cancelado.", menuPrincipal()); }

    // Paso GPS
    if (s.paso === 'pregunta_gps') {
        if (txt === '✅ Sí, usar GPS') {
            s.paso = 'esperando_gps';
            return ctx.reply("📍 Presiona el botón:", Markup.keyboard([[Markup.button.locationRequest('📍 ENVIAR MI GPS')]]).resize());
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
        return ctx.reply("✅ GPS fijado. 👁️ ¿Qué fenómeno observaste?");
    }

    // Pasos Manuales
    if (s.paso === 'pais') { s.datos.pais = txt; s.paso = 'ciudad'; return ctx.reply("2️⃣ ¿En qué CIUDAD o PROVINCIA?"); }
    if (s.paso === 'ciudad') { s.datos.ciudad = txt; s.paso = 'barrio'; return ctx.reply("3️⃣ ¿En qué BARRIO o ZONA?"); }
    if (s.paso === 'barrio') { s.datos.barrio = txt; s.paso = 'referencia'; return ctx.reply("4️⃣ Indica un PUNTO DE REFERENCIA o pon **no**."); }
    if (s.paso === 'referencia') { 
        s.datos.referencia = (txt && txt.toLowerCase() === 'no') ? 'Sin referencia' : txt; 
        s.paso = 'descripcion'; 
        return ctx.reply("5️⃣ **DESCRIPCIÓN:** ¿Qué fenómeno viste?"); 
    }

    // IA y Multimedia
    if (s.paso === 'descripcion') {
        s.datos.descripcion = txt;
        s.paso = 'interrogatorio';
        await ctx.sendChatAction('typing');
        const res = await model.generateContent(`Testigo vio: "${txt}". Haz 2 preguntas técnicas breves.`);
        return ctx.reply(`🔍 **INTERROGATORIO AIFUCITO:**\n\n${res.response.text()}`);
    }

    if (s.paso === 'interrogatorio') {
        s.datos.detalles_ia = txt;
        s.paso = 'multimedia';
        return ctx.reply("📸 Envía fotos o videos. Al terminar pulsa '🚀 FINALIZAR'.", Markup.keyboard([['🚀 FINALIZAR'], ['Cancelar']]).resize());
    }

    if (ctx.message.photo && s.paso === 'multimedia') {
        s.datos.fotos.push(ctx.message.photo[ctx.message.photo.length - 1].file_id);
        return ctx.reply("✅ Foto guardada.");
    }

    if (txt === '🚀 FINALIZAR') {
        const user = data.usuarios.find(u => u.id === id);
        if(user) user.puntos++;
        data.reportes.push({ id_rep: Date.now(), user: id, ...s.datos });
        guardar();
        publicarReporte(s.datos, ctx); 
        delete sesiones[id];
        return ctx.reply("✅ **REPORTE ENVIADO CON ÉXITO**", menuPrincipal());
    }
});

// ==========================================
// MÓDULO 6: PUBLICADOR AUTOMÁTICO
// ==========================================
async function publicarReporte(datos, ctx) {
    const CANALES = {
        "Uruguay": "-1002081514745",   
        "Argentina": "-1002120455561", 
        "Chile": "-1002084654961",     
        "Otro (Global)": "-1002086324681",
        "RadarVIP": "-1002070387533"   
    };
    
    const nombreUser = ctx.from.first_name || "Investigador";
    const canalDestino = CANALES[datos.pais] || CANALES["Otro (Global)"];
    const fecha = new Date().toLocaleString('es-UY', { timeZone: 'America/Montevideo' });

    const ficha = `🛸 **REPORTE AIFU**\n👤 **POR:** ${nombreUser}\n📍 **PAÍS:** ${datos.pais}\n🏙️ **CIUDAD:** ${datos.ciudad || 'N/A'}\n🏠 **BARRIO:** ${datos.barrio || 'N/A'}\n🚩 **REF:** ${datos.referencia || 'N/A'}\n━━━━━━━━━━━━\n👁️ **DESCRIPCIÓN:**\n"${datos.descripcion}"\n\n🔍 **IA:** ${datos.detalles_ia || 'N/A'}\n📅 ${fecha}`;

    try {
        await bot.telegram.sendMessage(canalDestino, ficha);
        await bot.telegram.sendMessage(CANALES["RadarVIP"], ficha);
    } catch (e) { console.error("Error difusión:", e.message); }
}

// Charlar con la IA
bot.hears('👽 Charlar con AIFUCITO', ctx => {
    sesionesChat[ctx.from.id] = true;
    ctx.reply("👽 Conexión establecida. Escribe 'Salir' para terminar.");
});

bot.on('text', async (ctx) => {
    if (sesionesChat[ctx.from.id]) {
        if (ctx.message.text === 'Salir') { sesionesChat[ctx.from.id] = false; return ctx.reply("Conexión cerrada.", menuPrincipal()); }
        await ctx.sendChatAction('typing');
        const r = await model.generateContent(ctx.message.text);
        ctx.reply(r.response.text());
    }
});

bot.launch();
