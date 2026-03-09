// ==========================================
// MÓDULO 1: IMPORTACIONES Y HERRAMIENTAS
// ==========================================
import { Telegraf, Markup } from 'telegraf';
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';
import express from 'express';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3000;

// Mantiene el bot vivo en Render
app.get('/', (req, res) => res.send('AIFUCITO 5.0 - SISTEMA ACTIVO'));
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));

// ==========================================
// MÓDULO 2: CONFIGURACIÓN DE LLAVES Y IA
// ==========================================
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "Eres AIFUCITO, investigador experto en OVNIs de AIFU Uruguay. Tu misión es entrevistar testigos de forma técnica y amable."
});

// ==========================================
// MÓDULO 3: BASE DE DATOS Y RANGOS
// ==========================================
let data = { usuarios: [], reportes: [] };
const dataPath = './data.json';

// Si ya existe información guardada, la carga
if (fs.existsSync(dataPath)) {
    data = JSON.parse(fs.readFileSync(dataPath));
}

const guardar = () => fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));

const RANGOS = [
    "Fajinero Espacial", 
    "Recluta de Radar", 
    "Cadete AIFU", 
    "Explorador del Cielo", 
    "Investigador de Campo", 
    "Oficial de Inteligencia", 
    "Comandante Intergaláctico"
];

function obtenerRango(puntos) {
    let index = Math.floor(puntos / 3); 
    return RANGOS[Math.min(index, RANGOS.length - 1)];
}

// ==========================================
// MÓDULO 4: GESTIÓN DE REPORTES (PASO A PASO)
// ==========================================

// --- INICIO DEL REPORTE ---
bot.hears('🛸 Reportar Avistamiento', ctx => {
    sesiones[ctx.from.id] = { paso: 'pregunta_gps', datos: { fotos: [] } };
    ctx.reply("🛸 **INICIANDO REPORTE AIFU**\n\n¿Deseas enviar tu ubicación exacta por GPS?", 
        Markup.keyboard([
            ['✅ Sí, usar GPS', '❌ No, manual'],
            ['Cancelar']
        ]).resize().oneTime());
});

// --- MOTOR DE PASOS (UBICACIÓN Y DESCRIPCIÓN) ---
bot.on(['text', 'location', 'photo'], async (ctx, next) => {
    const id = ctx.from.id;
    const s = sesiones[id];
    
    // Si el usuario no está en un reporte activo, pasamos al siguiente módulo
    if (!s) return next();

    const txt = ctx.message.text;
    if (txt === 'Cancelar') { 
        delete sesiones[id]; 
        return ctx.reply("❌ Reporte cancelado.", menuPrincipal()); 
    }

    // --- PASO 1: ELECCIÓN DE MÉTODO ---
    if (s.paso === 'pregunta_gps') {
        if (txt === '✅ Sí, usar GPS') {
            s.paso = 'esperando_gps';
            return ctx.reply("📍 Presiona el botón para enviar tu posición:", 
                Markup.keyboard([[Markup.button.locationRequest('📍 ENVIAR MI GPS')]]).resize());
        } else {
            s.paso = 'pais';
            return ctx.reply("1️⃣ **SELECCIÓN DE PAÍS:**", 
                Markup.keyboard([
                    ['Uruguay', 'Argentina'], 
                    ['Chile', 'Otro (Global)'], 
                    ['Cancelar']
                ]).resize());
        }
    }

    // --- PASO 1.5: RECEPCIÓN DE GPS ---
    if (s.paso === 'esperando_gps' && ctx.message.location) {
        s.datos.lat = ctx.message.location.latitude;
        s.datos.lng = ctx.message.location.longitude;
        s.datos.pais = "Detectado por GPS";
        s.paso = 'descripcion';
        return ctx.reply("✅ GPS fijado correctamente.\n\n👁️ **PASO 2:** Describe el fenómeno: ¿Qué viste?");
    }

    // --- PASOS MANUALES OBLIGATORIOS ---
    if (s.paso === 'pais') { 
        s.datos.pais = txt; 
        s.paso = 'ciudad'; 
        return ctx.reply("2️⃣ ¿En qué CIUDAD o PROVINCIA ocurrió?"); 
    }
    
    if (s.paso === 'ciudad') { 
        s.datos.ciudad = txt; 
        s.paso = 'barrio'; 
        return ctx.reply("3️⃣ ¿En qué BARRIO o ZONA específica?"); 
    }
    
    if (s.paso === 'barrio') { 
        s.datos.barrio = txt; 
        s.paso = 'referencia'; 
        return ctx.reply("4️⃣ Indica un PUNTO DE REFERENCIA (ej: 'Frente al faro').\n\n👉 Si no tienes referencias, solo pon **no**."); 
    }
    
    if (s.paso === 'referencia') { 
        s.datos.referencia = (txt.toLowerCase() === 'no') ? 'Sin referencia específica' : txt
        
// ==========================================
// MÓDULO 6: PUBLICADOR INTERNACIONAL (CONO SUR)
// ==========================================

async function publicarReporte(datos, ctx) {
    // Lista de canales por país (IDs o Enlaces)
    const CANALES = {
        "Uruguay": "-1002081514745",   // AIFU Uruguay
        "Argentina": "-1002120455561", // AIFU Argentina
        "Chile": "-1002084654961",     // AIFU Chile
        "Global": "-1002086324681",    // AIFU Global
        "RadarVIP": "-1002070387533"   // Radar Cono Sur (VIP)
    };
    
    const nombreUser = ctx.from.first_name || "Investigador";
    const paisReporte = datos.pais || "Global";
    const fecha = new Date().toLocaleString('es-UY', { timeZone: 'America/Montevideo' });

    // Diseño de la Ficha Técnica
    const ficha = 
        `🛸 **ALERTA AIFU: AVISTAMIENTO**\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 **POR:** ${nombreUser}\n` +
        `📍 **PAÍS:** ${paisReporte.toUpperCase()}\n` +
        `🏙️ **CIUDAD:** ${datos.ciudad || 'N/A'}\n` +
        `🏠 **ZONA:** ${datos.barrio || 'N/A'}\n` +
        `🚩 **REF:** ${datos.referencia || 'Sin referencia'}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👁️ **DESCRIPCIÓN:**\n"${datos.descripcion}"\n\n` +
        `🔍 **ANÁLISIS TÉCNICO:**\n${datos.detalles_ia || 'Analizando...'}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📅 ${fecha}\n` +
        `📡 #AIFU #UFO #UAP #${paisReporte}`;

    try {
        // 1. PUBLICAR EN EL CANAL DEL PAÍS CORRESPONDIENTE (Solo Texto)
        let canalDestino = CANALES[paisReporte] || CANALES["Global"];
        await bot.telegram.sendMessage(canalDestino, ficha);

        // 2. PUBLICAR EN EL RADAR CONO SUR (VIP con Multimedia)
        if (datos.fotos && datos.fotos.length > 0) {
            await bot.telegram.sendPhoto(CANALES["RadarVIP"], datos.fotos[0], { 
                caption: ficha + "\n\n⭐ [MULTIMEDIA COMPLETA EN RADAR VIP]" 
            });
        } else {
            await bot.telegram.sendMessage(CANALES["RadarVIP"], ficha);
        }

        // 3. SIEMPRE ENVIAR AL GLOBAL PARA RESPALDO
        if (paisReporte !== "Global") {
            await bot.telegram.sendMessage(CANALES["Global"], ficha);
        }

        console.log(`📢 Reporte de ${paisReporte} distribuido con éxito.`);
    } catch (error) {
        console.error("❌ Error en distribución:", error.message);
    }
}
// Lanzamiento
bot.launch();
