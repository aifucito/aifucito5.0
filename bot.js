import { Telegraf, Markup } from 'telegraf';
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';
import express from 'express';
import 'dotenv/config';

// --- CONFIGURACIÓN DE LLAVES ---
const BOT_TOKEN = process.env.TELEGRAM_TOKEN; 
const GEMINI_KEY = process.env.GEMINI_API_KEY;

const bot = new Telegraf(BOT_TOKEN);
const genAI = new GoogleGenerativeAI(GEMINI_KEY);

// Personalidad de AIFUCITO
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "Eres AIFUCITO, el investigador oficial de AIFU. Tu misión es analizar reportes de OVNIs. Eres serio, técnico y apasionado por la ufología del Cono Sur. Nunca sales de tu papel."
});

// --- BASE DE DATOS LOCAL ---
let data = { usuarios: [], reportes: [], listaNegra: [] };
const dataPath = './data.json';

if (fs.existsSync(dataPath)) {
    data = JSON.parse(fs.readFileSync(dataPath));
}

const guardar = () => fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));

// Estructura de Niveles
const RANGOS = [
    "Fajinero Espacial", 
    "Recluta de Radar", 
    "Cadete AIFU", 
    "Explorador del Cielo", 
    "Investigador de Campo", 
    "Oficial de Inteligencia", 
    "Comandante Intergaláctico"
];

const app = express();
let sesiones = {}; // Control de reportes en curso
let sesionesChat = {}; // Control de charla con IA
// --- FUNCIONES DE APOYO ---
function obtenerRango(puntos) {
    let index = Math.floor(puntos / 3); // Suben de nivel cada 3 reportes para que sea dinámico
    return RANGOS[Math.min(index, RANGOS.length - 1)];
}

const menuPrincipal = () => Markup.keyboard([
    ['🛸 Reportar Avistamiento', '🗺️ Mapa Global'],
    ['👤 Mi Perfil', '👽 Charlar con AIFUCITO'],
    ['📡 Canales AIFU', '💳 Hazte Socio (VIP)']
]).resize();

// --- INICIO Y REGISTRO ---
bot.start(ctx => {
    let user = data.usuarios.find(u => u.id === ctx.from.id);
    if (!user) {
        user = { 
            id: ctx.from.id, 
            nombre: ctx.from.first_name, 
            puntos: 0, 
            vip: false, 
            fechaRegistro: new Date() 
        };
        data.usuarios.push(user);
        guardar();
    }
    const rango = obtenerRango(user.puntos);
    ctx.reply(`👽 ¡Bienvenido a la Central de Inteligencia AIFU, ${user.nombre}!\n\nTu rango actual: **${rango}**\n\nUsa el menú de abajo para empezar.`, menuPrincipal());
});

// --- PERFIL DEL USUARIO ---
bot.hears('👤 Mi Perfil', ctx => {
    const user = data.usuarios.find(u => u.id === ctx.from.id);
    const rango = obtenerRango(user.puntos);
    const siguientes = 3 - (user.puntos % 3);
    
    ctx.reply(`👤 **EXPEDIENTE AIFU**\n\n` +
              `▪️ **Nombre:** ${user.nombre}\n` +
              `▪️ **Rango:** ${rango}\n` +
              `▪️ **Reportes:** ${user.puntos}\n` +
              `▪️ **Estado:** ${user.vip ? '⭐ SOCIO VIP' : 'Colaborador Estándar'}\n\n` +
              `🚀 Te faltan ${siguientes} reportes para el siguiente nivel.`);
});

// --- CHARLA CON IA (GEMINI) ---
bot.hears('👽 Charlar con AIFUCITO', ctx => {
    sesionesChat[ctx.from.id] = true;
    ctx.reply("👽 Conexión cerebral establecida. Soy AIFUCITO.\n¿Qué fenómeno quieres analizar hoy? (Escribe 'Terminar charla' para salir)", 
        Markup.keyboard([['Terminar charla']]).resize());
});
// --- LÓGICA DE REPORTE INTELIGENTE ---
bot.hears('🛸 Reportar Avistamiento', ctx => {
    const user = data.usuarios.find(u => u.id === ctx.from.id);
    if (user?.listaNegra) return ctx.reply("Acceso denegado.");
    
    sesiones[ctx.from.id] = { paso: 'ubicacion', datos: { fotos: [], videos: [] } };
    ctx.reply("📍 ¿Dónde ocurrió el fenómeno?\nEnvía tu ubicación GPS o escribe la ciudad/país.", 
        Markup.keyboard([[Markup.button.locationRequest('📍 Enviar mi GPS')], ['Cancelar Reporte']]).resize().oneTime());
});

bot.on('location', ctx => {
    const s = sesiones[ctx.from.id];
    if (!s) return;
    s.datos.lat = ctx.message.location.latitude;
    s.datos.lng = ctx.message.location.longitude;
    s.datos.metodo = 'GPS';
    s.paso = 'descripcion_inicial';
    ctx.reply("✅ Ubicación GPS recibida.\n\n👁️ Ahora, descríbeme con tus palabras: ¿Qué viste? (ej: 'Una luz roja en zigzag' o 'Un disco metálico')");
});

// --- MANEJADOR DE TEXTO Y MULTIMEDIA (INTERROGATORIO) ---
bot.on(['text', 'photo', 'video'], async (ctx, next) => {
    const id = ctx.from.id;
    const s = sesiones[id];
    const user = data.usuarios.find(u => u.id === id);

    if (!s) return next(); // Si no está reportando, pasa al siguiente bloque (IA o Comandos)

    // PASO: Ubicación manual (si no usó GPS)
    if (s.paso === 'ubicacion' && ctx.message.text !== 'Cancelar Reporte') {
        s.datos.ubicacion_manual = ctx.message.text;
        s.datos.metodo = 'Manual';
        s.paso = 'descripcion_inicial';
        return ctx.reply("✅ Ubicación guardada. Ahora descríbeme: ¿Qué fenómeno observaste?");
    }

    // PASO: Interrogatorio IA (Aquí Gemini analiza y pregunta)
    if (s.paso === 'descripcion_inicial') {
        s.datos.descripcion = ctx.message.text;
        s.paso = 'preguntas_ia';
        
        await ctx.sendChatAction('typing');
        const prompt = `Un testigo de OVNIS describe: "${ctx.message.text}". 
        Como investigador de AIFU, genera 3 preguntas técnicas muy cortas para identificar el fenómeno (ej: tamaño, brillo, sonido, trayectoria). 
        No saludes, solo haz las preguntas.`;
        
        const result = await model.generateContent(prompt);
        const preguntas = result.response.text();
        
        return ctx.reply(`Interesante. Para mi registro técnico necesito saber:\n\n${preguntas}\n\n(Responde aquí mismo)`);
    }

    // PASO: Respuesta a IA y paso a Multimedia
    if (s.paso === 'preguntas_ia') {
        s.datos.detalles_ia = ctx.message.text;
        s.paso = 'multimedia';
        return ctx.reply("📸 ¡Perfecto! Ahora envía FOTOS o VIDEOS del evento.\nCuando termines, presiona el botón de abajo.", 
            Markup.keyboard([['🚀 FINALIZAR REPORTE'], ['Cancelar Reporte']]).resize());
    }

    // CAPTURA DE FOTOS
    if (ctx.message.photo && s.paso === 'multimedia') {
        const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        s.datos.fotos.push(fileId);
        return ctx.reply(`✅ Foto ${s.datos.fotos.length} recibida. ¿Tienes más evidencias o finalizamos?`);
    }

    // CAPTURA DE VIDEOS
    if (ctx.message.video && s.paso === 'multimedia') {
        s.datos.videos.push(ctx.message.video.file_id);
        return ctx.reply(`🎥 Video recibido. ¿Quieres enviar algo más?`);
    }

    // FINALIZACIÓN DEL REPORTE
    if (ctx.message.text === '🚀 FINALIZAR REPORTE' && s.paso === 'multimedia') {
        const reporteFinal = {
            id_reporte: Date.now(),
            userId: id,
            nombre: user.nombre,
            ...s.datos,
            fecha: new Date().toISOString()
        };
        
        data.reportes.push(reporteFinal);
        user.puntos++; // Sube puntos para los rangos
        guardar();
        delete sesiones[id];

        return ctx.reply(`✅ REPORTE ARCHIVADO CON ÉXITO.\n\n¡Gracias ${user.nombre}! Tu aporte es vital para AIFU. Ya puedes verlo en tu historial.`, menuPrincipal());
    }

    if (ctx.message.text === 'Cancelar Reporte') {
        delete sesiones[id];
        return ctx.reply("❌ Reporte cancelado y datos eliminados.", menuPrincipal());
    }
});
