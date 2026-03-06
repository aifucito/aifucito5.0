/**
 * AIFUCITO 5.0 - RED DE INTELIGENCIA UFOLÓGICA GLOBAL
 * ESTADO: PRODUCCIÓN ESCALABLE (CONO SUR)
 * CARACTERÍSTICAS: MAPA DE CALOR, RANGOS XP, FILTROS MULTIMEDIA, IA EVOLUTIVA
 */

import { Telegraf, Markup, session } from 'telegraf';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import axios from 'axios'; // Para geocodificación y APIs externas
import { fileURLToPath } from 'url';

// --- CONFIGURACIÓN DE RUTAS Y CONSTANTES ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const LOGS_DIR = path.join(__dirname, 'logs');
[DATA_DIR, LOGS_DIR].forEach(dir => { if (!fs.existsSync(dir)) fs.mkdirSync(dir); });

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const FECHA_LIMITE_LIBRE = new Date('2026-03-13T23:59:59').getTime();

// --- CANALES OPERATIVOS ---
const CANALES = {
    RADAR: '@aifu_radar_conosur', // Acceso Total (Admin/VIP)
    NACIONAL: '@aifu_uy',         // Canal de destino público
    LOGS: '@aifu_logs_internos'   // Para auditoría del Admin
};

// --- BASE DE DATOS LOCAL ROBUSTA ---
const DB_PATHS = {
    users: path.join(DATA_DIR, 'usuarios.json'),
    reports: path.join(DATA_DIR, 'reportes.json'),
    memory: path.join(DATA_DIR, 'memoria_ia.json'),
    history: path.join(DATA_DIR, 'historias_vip.json')
};

let db = {
    users: loadJSON(DB_PATHS.users, []),
    reports: loadJSON(DB_PATHS.reports, []),
    memory: loadJSON(DB_PATHS.memory, { interacciones: 0, palabrasClave: {}, contextoHistorico: [] }),
    history: loadJSON(DB_PATHS.history, [])
};

function loadJSON(path, fallback) {
    try { return fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : fallback; }
    catch (e) { logError(`Error cargando ${path}: ${e.message}`); return fallback; }
}

function saveDB() {
    try {
        Object.keys(DB_PATHS).forEach(key => fs.writeFileSync(DB_PATHS[key], JSON.stringify(db[key], null, 2)));
    } catch (e) { logError(`Error guardando DB: ${e.message}`); }
}

function logError(msg) {
    const entry = `[${new Date().toISOString()}] ERROR: ${msg}\n`;
    fs.appendFileSync(path.join(LOGS_DIR, 'error.log'), entry);
}

// --- MOTOR DE RANGOS Y GAMIFICACIÓN (SISTEMA DE XP) ---
const NIVELES = [
    { id: 1, nombre: "Cadete en Pañales 👶", xp: 0, frase: "Aún crees que los satélites son naves nodrizas." },
    { id: 2, nombre: "Vigía del Cielo 🔭", xp: 500, frase: "Tus retinas ya aguantan el brillo de un foo fighter." },
    { id: 3, nombre: "Rastreador de Anomalías 📡", xp: 1500, frase: "Los radares oficiales te tienen miedo." },
    { id: 4, nombre: "Coronel del Cosmos 🎖️", xp: 3500, frase: "Casi puedes tocar el fuselaje de un cigarro volador." },
    { id: 5, nombre: "Maestro de la Verdad 👽", xp: 7000, frase: "Los grises te saludan cuando pasan por tu casa." }
];

const calcularNivel = (xp) => [...NIVELES].reverse().find(n => xp >= n.xp);

// --- SERVIDOR WEB INTEGRADO (MAPA DE CALOR) ---
const app = express();
app.use(cors());
app.use(express.static('public'));

app.get('/api/heatmap', (req, res) => {
    // Solo enviamos datos de los últimos 30 días para mantener el mapa "vivo"
    const unMesAtras = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const dataMapa = db.reports
        .filter(r => r.timestamp > unMesAtras && r.lat && r.lng)
        .map(r => ({ lat: r.lat, lng: r.lng, intensity: r.vip ? 1.0 : 0.4 }));
    res.json(dataMapa);
});

app.listen(process.env.PORT || 3000, () => console.log("🚀 Servidor Web AIFU Online"));

// --- INICIALIZACIÓN DEL BOT ---
const bot = new Telegraf(BOT_TOKEN);
bot.use(session());

const menuPrincipal = (u) => {
    const buttons = [
        ['🛸 Reportar Avistamiento', '🌍 Ver Mapa Vivo'],
        ['🤖 Charlar con Aifucito', '📜 Archivos Secretos (VIP)'],
        ['🚀 Ser Investigador VIP', '⭐ Mi Rango'],
        ['📡 Red AIFU', '❓ Quién es Aifucito']
    ];
    return Markup.keyboard(buttons).resize();
};

// --- MIDDLEWARE: GESTIÓN DE USUARIOS Y TRACKING ---
bot.use(async (ctx, next) => {
    if (!ctx.from) return next();
    let u = db.users.find(x => x.id === ctx.from.id);
    
    if (!u) {
        u = {
            id: ctx.from.id,
            nombre: ctx.from.first_name,
            username: ctx.from.username || "Anon",
            xp: 0,
            reportesCount: 0,
            vip: ctx.from.id === ADMIN_ID,
            admin: ctx.from.id === ADMIN_ID,
            fechaRegistro: new Date().toISOString()
        };
        db.users.push(u);
        saveDB();
    }
    ctx.state.user = u;
    return next();
});

// --- COMANDOS PRINCIPALES ---

bot.start((ctx) => {
    const diasLibres = Math.ceil((FECHA_LIMITE_LIBRE - Date.now()) / (1000 * 60 * 60 * 24));
    ctx.reply(
        `👽 **¡BIENVENIDO A LA RED AIFU, AGENTE!**\n\nSoy **Aifucito**, tu contacto en la Tierra. Mis sensores detectan actividad inusual en tu sector.\n\n` +
        `⏳ **ESTADO:** Acceso LIBRE por ${diasLibres} días más.\n` +
        `Aprovecha para subir de rango y marcar tu zona en el mapa mundial.`,
        menuPrincipal(ctx.state.user)
    );
});

bot.hears('⭐ Mi Rango', (ctx) => {
    const u = ctx.state.user;
    const n = calcularNivel(u.xp);
    const sig = NIVELES[NIVELES.indexOf(n) + 1];
    
    let barra = "";
    if (sig) {
        const porc = Math.floor(((u.xp - n.xp) / (sig.xp - n.xp)) * 10);
        barra = "█".repeat(porc) + "░".repeat(10 - porc);
    } else {
        barra = "██████████ (NIVEL MAX)";
    }

    ctx.reply(
        `🕵️ **EXPEDIENTE CLASIFICADO**\n\n` +
        `👤 **Agente:** ${u.nombre}\n` +
        `🎖️ **Rango:** ${n.nombre}\n` +
        `🔋 **Energía XP:** ${u.xp}\n` +
        `📊 **Progreso:** ${barra}\n\n` +
        `💬 **Aifucito dice:** _"${n.frase}"_`,
        { parse_mode: 'Markdown' }
    );
});

// --- SISTEMA DE REPORTE INTELIGENTE ---

bot.hears('🛸 Reportar Avistamiento', (ctx) => {
    ctx.session = { step: 'UBICACION', data: { media: [] } };
    ctx.reply(
        "📍 **INICIO DE REPORTE TÁCTICO**\n\nPara el Mapa de Calor, necesitamos precisión.\n\n¿GPS exacto (lo mejor) o ingreso manual?",
        Markup.keyboard([
            [Markup.button.locationRequest('📍 Enviar GPS')],
            ['✍️ Ingreso Manual', '❌ Cancelar']
        ]).resize()
    );
});

bot.on('location', async (ctx) => {
    if (!ctx.session || ctx.session.step !== 'UBICACION') return;
    
    ctx.session.data.lat = ctx.message.location.latitude;
    ctx.session.data.lng = ctx.message.location.longitude;
    ctx.session.data.metodo = 'GPS';
    ctx.session.step = 'DESCRIPCION';
    
    ctx.reply("🛰️ **¡COORDENADAS FIJADAS!** No necesito más referencias espaciales.\n\n🛸 **¿Qué estás viendo?** Describe forma, luces y comportamiento:");
});

bot.on('text', async (ctx) => {
    const u = ctx.state.user;
    const txt = ctx.message.text;

    if (txt === '❌ Cancelar') { ctx.session = null; return ctx.reply("Reporte abortado. Los grises te vigilan.", menuPrincipal(u)); }

    // --- CHAT CON IA (AIFUCITO) ---
    if (txt === '🤖 Charlar con Aifucito') {
        db.memory.interacciones++;
        saveDB();
        return ctx.reply("¡Epa! Aquí estoy. Analizando frecuencias... No creas todo lo que dice la NASA, yo tengo los datos reales. ¿Qué quieres saber?");
    }

    // --- ARCHIVOS VIP ---
    if (txt === '📜 Archivos Secretos (VIP)') {
        if (!u.vip) return ctx.reply("🔒 **CONTENIDO BLOQUEADO.**\n\nSolo investigadores VIP pueden entrar al Archivo de las Estrellas. ¿Quieres subir de nivel?", 
        Markup.inlineKeyboard([[Markup.button.callback("🚀 Ser VIP", "promo_vip")]]));
        
        return ctx.reply("📖 **BITÁCORA VIP:** Accediendo a historias clasificadas...");
    }

    if (!ctx.session) return;

    // --- LÓGICA DE PASOS DEL REPORTE ---
    const s = ctx.session;
    switch (s.step) {
        case 'UBICACION':
            if (txt === '✍️ Ingreso Manual') { s.step = 'PAIS'; ctx.reply("Indica el PAÍS:"); }
            break;
        case 'PAIS': s.data.pais = txt; s.step = 'CIUDAD'; ctx.reply("Indica la CIUDAD:"); break;
        case 'CIUDAD': s.data.ciudad = txt; s.step = 'BARRIO'; ctx.reply("Indica BARRIO y REFERENCIA visual (para geolocalizar):"); break;
        case 'BARRIO': s.data.referencia = txt; s.step = 'DESCRIPCION'; ctx.reply("Describe el objeto o fenómeno:"); break;
        case 'DESCRIPCION': 
            s.data.descripcion = txt; 
            s.step = 'MULTIMEDIA'; 
            ctx.reply("📸 **EVIDENCIA:** Envía FOTO o VIDEO (20s máx). Al terminar, pulsa Finalizar.", 
            Markup.keyboard([['✅ Finalizar Reporte', '❌ Cancelar']]).resize()); 
            break;
    }

    if (txt === '✅ Finalizar Reporte' && s.step === 'MULTIMEDIA') {
        await procesarReporteFinal(ctx);
    }
});

// --- GESTIÓN DE MULTIMEDIA (FOTOS Y VIDEOS) ---

bot.on(['photo', 'video'], async (ctx) => {
    if (!ctx.session || ctx.session.step !== 'MULTIMEDIA') return;
    
    const media = ctx.message.photo 
        ? { type: 'photo', id: ctx.message.photo.pop().file_id }
        : { type: 'video', id: ctx.message.video.file_id };

    if (media.type === 'video' && ctx.message.video.duration > 25) {
        return ctx.reply("⚠️ Video demasiado largo. Los radares solo aceptan clips de hasta 20 segundos.");
    }

    ctx.session.data.media.push(media);
    ctx.reply(`✅ ${media.type === 'photo' ? 'Imagen' : 'Video'} cargado. ¿Quieres enviar algo más o Finalizar?`);
});

// --- FINALIZACIÓN Y DISTRIBUCIÓN (EL CORAZÓN DEL SISTEMA) ---

async function procesarReporteFinal(ctx) {
    const u = ctx.state.user;
    const s = ctx.session.data;
    const idReporte = Date.now();

    // Geocodificación manual si no hay GPS
    if (s.metodo !== 'GPS') {
        try {
            const query = `${s.referencia}, ${s.ciudad}, ${s.pais}`;
            const geo = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
            if (geo.data.length > 0) {
                s.lat = parseFloat(geo.data[0].lat);
                s.lng = parseFloat(geo.data[0].lon);
            }
        } catch (e) { logError("Geocode fail: " + e.message); }
    }

    const reporteFinal = {
        id: idReporte,
        userId: u.id,
        nombre: u.nombre,
        ...s,
        timestamp: idReporte,
        vip: u.vip
    };

    db.reports.push(reporteFinal);
    u.xp += (s.metodo === 'GPS' ? 150 : 80);
    u.reportesCount++;
    saveDB();

    const captionBase = `🛸 **ALERTA DE AVISTAMIENTO**\n📍 Lugar: ${s.ciudad || 'GPS'}, ${s.pais || 'Satélite'}\n📝 ${s.descripcion}\n👤 Por: ${u.nombre} (${calcularNivel(u.xp).nombre})`;

    // 1. PUBLICACIÓN EN RADAR TÁCTICO (SOLO ADMIN/VIP - FULL)
    for (let m of s.media) {
        if (m.type === 'photo') await ctx.telegram.sendPhoto(CANALES.RADAR, m.id, { caption: `🎯 [RADAR FULL]\n${captionBase}` });
        else await ctx.telegram.sendVideo(CANALES.RADAR, m.id, { caption: `🎯 [RADAR FULL]\n${captionBase}` });
    }

    // 2. PUBLICACIÓN EN CANAL NACIONAL (PÚBLICO - CON SPOILER)
    for (let m of s.media) {
        const opt = { caption: captionBase, has_spoiler: true };
        if (m.type === 'photo') await ctx.telegram.sendPhoto(CANALES.NACIONAL, m.id, opt);
        else await ctx.telegram.sendVideo(CANALES.NACIONAL, m.id, opt);
    }

    ctx.reply(
        "🚀 **¡REPORTE COMPLETADO!**\n\nHas sumado XP y tu punto ya brilla en el Mapa de Calor Mundial. Tu evidencia se publicó borrosa para los civiles, pero nosotros ya la estamos analizando en el Radar VIP.",
        menuPrincipal(u)
    );
    ctx.session = null;
}

// --- LANZAMIENTO ---
bot.launch().then(() => console.log("👽 AIFUCITO 5.0 ONLINE - LA RED ESTÁ ACTIVA"));

// Manejo de cierre seguro
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
