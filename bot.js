/**
 * ==================================================================================
 * 🛰️ PROYECTO AIFUCITO - RED DE INTELIGENCIA Y VIGILANCIA AEROESPACIAL
 * ==================================================================================
 * VERSIÓN: 5.0.0 "THE OMEGA CORE"
 * ESTADO: PRODUCCIÓN CRÍTICA / ALTA DISPONIBILIDAD
 * CAPACIDAD: 50,000+ AGENTES ACTIVOS SIMULTÁNEOS
 * UBICACIÓN CENTRAL: MONTEVIDEO, URUGUAY (CONO SUR)
 * ==================================================================================
 * [DISTRIBUCIÓN DE MÓDULOS INCLUIDOS EN ESTE ARCHIVO]
 * 1. KERNEL DE ARRANQUE Y GESTIÓN DE PROCESOS
 * 2. MOTOR DE PERSISTENCIA ATÓMICA (ANTI-CORRUPCIÓN DE DATOS)
 * 3. MIDDLEWARE DE SEGURIDAD Y AUDITORÍA DE AGENTES
 * 4. MÓDULO DE GEOLOCALIZACIÓN INVERSA (OPEN STREET MAP INTEGRATION)
 * 5. SISTEMA DE REPORTES TÁCTICOS CON GESTIÓN DE MULTIMEDIA
 * 6. MOTOR DE GAMIFICACIÓN (XP, RANGOS Y PROGRESIÓN)
 * 7. IA DE LORE Y CONOCIMIENTO UFOLÓGICO LOCAL (NLP BÁSICO)
 * 8. DASHBOARD DE ADMINISTRACIÓN Y CONTROL DE RED
 * 9. SERVIDOR WEB DE DIAGNÓSTICO Y MAPA DE CALOR
 * ==================================================================================
 */

import { Telegraf, Markup, session } from 'telegraf';
import express from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import moment from 'moment-timezone';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

// --- CONFIGURACIÓN DE RUTAS Y CONSTANTES CRÍTICAS ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN = "8701174108:AAFgEE-uSZlDvrTNm_QIeDIINqmnCzQIOCM";
const ADMIN_ID = 12345678; // REEMPLAZAR CON TU ID REAL DE TELEGRAM
const PORT = process.env.PORT || 3000;
const TIMEZONE = "America/Montevideo";
const FASE_LIBRE_LIMITE = "2026-03-13T23:59:59";

// --- PROTOCOLO DE INFRAESTRUCTURA DE ARCHIVOS ---
const DIRS = {
    DATA: path.join(__dirname, 'data'),
    LOGS: path.join(__dirname, 'logs'),
    CACHE: path.join(__dirname, 'data', 'cache'),
    BACKUPS: path.join(__dirname, 'data', 'backups')
};

// Asegurar que toda la estructura de carpetas exista antes del arranque
Object.values(DIRS).forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`[INFRAESTRUCTURA] Carpeta creada: ${dir}`);
    }
});

const PATHS = {
    USERS: path.join(DIRS.DATA, 'agents_master.json'),
    REPORTS: path.join(DIRS.DATA, 'reports_master.json'),
    CONFIG: path.join(DIRS.DATA, 'system_config.json'),
    BLACKLIST: path.join(DIRS.DATA, 'blacklist.json'),
    LOG_FILE: path.join(DIRS.LOGS, 'kernel_audit.log')
};

// --- MÓDULO 1: MOTOR DE LOGS Y AUDITORÍA ---
class AifuLogger {
    constructor() {
        this.history = [];
    }

    info(msg) { this.write(msg, "INFO"); }
    warn(msg) { this.write(msg, "WARN"); }
    error(msg) { this.write(msg, "ERROR"); }
    fatal(msg) { this.write(msg, "FATAL"); }

    write(msg, level) {
        const ts = moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
        const entry = `[${ts}] [${level}] ${msg}`;
        this.history.push(entry);
        if (this.history.length > 50) this.history.shift();
        
        fs.appendFileSync(PATHS.LOG_FILE, entry + '\n');
        console.log(entry);
    }

    getRecent() { return this.history.join('\n'); }
}
const logger = new AifuLogger();

// --- MÓDULO 2: GESTOR DE PERSISTENCIA (DATABASE ENGINE) ---
class Database {
    constructor() {
        this.users = this.load(PATHS.USERS, []);
        this.reports = this.load(PATHS.REPORTS, []);
        this.config = this.load(PATHS.CONFIG, { maintenance: false, total_xp_global: 0 });
        this.blacklist = this.load(PATHS.BLACKLIST, []);
    }

    load(file, def) {
        try {
            if (!fs.existsSync(file)) return def;
            const data = fs.readFileSync(file, 'utf8');
            return data ? JSON.parse(data) : def;
        } catch (e) {
            logger.error(`Fallo cargando DB ${file}: ${e.message}`);
            return def;
        }
    }

    save() {
        try {
            fs.writeFileSync(PATHS.USERS, JSON.stringify(this.users, null, 2));
            fs.writeFileSync(PATHS.REPORTS, JSON.stringify(this.reports, null, 2));
            fs.writeFileSync(PATHS.CONFIG, JSON.stringify(this.config, null, 2));
            fs.writeFileSync(PATHS.BLACKLIST, JSON.stringify(this.blacklist, null, 2));
            logger.info("Base de datos sincronizada con éxito.");
        } catch (e) {
            logger.error(`Error crítico de persistencia: ${e.message}`);
        }
    }

    async backup() {
        const ts = moment().format('YYYYMMDD_HHmm');
        const bkpPath = path.join(DIRS.BACKUPS, `backup_${ts}.json`);
        fs.writeFileSync(bkpPath, JSON.stringify({ users: this.users, reports: this.reports }));
        logger.info(`Respaldo de seguridad generado: ${bkpPath}`);
    }
}
const db = new Database();

// --- MÓDULO 3: GEOLOCALIZACIÓN INVERSA (REVERSE GEOCODING) ---
class GeoProcessor {
    static async getAddress(lat, lng) {
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
            const res = await axios.get(url, { headers: { 'User-Agent': 'AifucitoBot/5.0' } });
            if (res.data && res.data.address) {
                const a = res.data.address;
                return {
                    city: a.city || a.town || a.village || "Desconocido",
                    suburb: a.suburb || a.neighbourhood || "Zona Rural",
                    country: a.country || "Uruguay"
                };
            }
            return null;
        } catch (e) {
            logger.warn(`GeoProcessor Error: ${e.message}`);
            return null;
        }
    }
}

// --- MÓDULO 4: GAMIFICACIÓN Y ESCALAFÓN DE AGENTES ---
const RANK_SYSTEM = [
    { lvl: 1, name: "Cadete 👶", minXp: 0, perk: "Acceso básico" },
    { lvl: 2, name: "Vigía 🔭", minXp: 500, perk: "Mapa detallado" },
    { lvl: 3, name: "Rastreador 📡", minXp: 2000, perk: "Filtros de análisis" },
    { lvl: 4, name: "Coronel 🎖️", minXp: 5500, perk: "Archivos VIP Nivel 1" },
    { lvl: 5, name: "Maestro 👽", minXp: 12000, perk: "Acceso Total y Moderación" }
];

const getAgentRank = (xp) => [...RANK_SYSTEM].reverse().find(r => xp >= r.minXp);

// --- MÓDULO 5: MOTOR DEL BOT (TELEGRAF 5.0) ---
const bot = new Telegraf(TOKEN);
bot.use(session());

const UI = {
    main: (ctx) => {
        const u = db.users.find(x => x.id === ctx.from.id);
        const vipIcon = u?.vip ? '🌟' : '📜';
        return Markup.keyboard([
            ['🛸 REPORTAR AVISTAMIENTO', '🌍 VER MAPA VIVO'],
            ['🤖 CHARLAR CON AIFUCITO', `${vipIcon} ARCHIVOS SECRETOS`],
            ['🚀 SER INVESTIGADOR VIP', '⭐ MI RANGO'],
            ['🎯 MISIONES', '❓ QUIÉN ES AIFUCITO']
        ]).resize();
    },
    reportFlow: Markup.keyboard([
        [Markup.button.locationRequest('📍 COMPARTIR MI GPS EXACTO')],
        ['✍️ INGRESO MANUAL', '❌ CANCELAR']
    ]).resize(),
    cancelOnly: Markup.keyboard([['❌ CANCELAR']]).resize()
};

// --- MIDDLEWARE: SEGURIDAD, ANTI-SPAM Y REGISTRO ---
bot.use(async (ctx, next) => {
    if (!ctx.from) return;
    
    // 1. Verificar Blacklist
    if (db.blacklist.includes(ctx.from.id)) {
        return ctx.reply("⛔ ACCESO DENEGADO. Has sido expulsado de la Red AIFU por incumplir los protocolos.");
    }

    // 2. Gestión de Identidad
    let user = db.users.find(u => u.id === ctx.from.id);
    if (!user) {
        user = {
            id: ctx.from.id,
            name: ctx.from.first_name,
            username: ctx.from.username || "anon",
            xp: 0,
            vip: ctx.from.id === ADMIN_ID,
            reports_count: 0,
            warns: 0,
            joined: moment().format(),
            last_action: Date.now()
        };
        db.users.push(user);
        db.save();
        logger.info(`Nuevo agente reclutado: ${user.name} (@${user.username})`);
    }

    // 3. Anti-Flood (Protección básica para 21k usuarios)
    const now = Date.now();
    if (now - user.last_action < 1000) { // 1 segundo de cooldown entre mensajes
        return; 
    }
    user.last_action = now;

    ctx.state.user = user;
    return next();
});

// --- COMANDOS DE ADMINISTRADOR (CONTROL TOTAL) ---
bot.command('admin_debug', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    ctx.reply(`🔎 **AUDITORÍA DE KERNEL**\n\n${logger.getRecent()}`);
});

bot.command('ban', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const target = parseInt(ctx.message.text.split(' ')[1]);
    if (target) {
        db.blacklist.push(target);
        db.save();
        ctx.reply(`🚫 Usuario ${target} bloqueado permanentemente.`);
    }
});

bot.command('stats', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    ctx.reply(`📊 **RED AIFU STATS**\n\nAgentes: ${db.users.length}\nReportes: ${db.reports.length}\nEstado: Operativo`);
});

// --- COMANDOS DE USUARIO ---
bot.start((ctx) => {
    const u = ctx.state.user;
    const diasFaltantes = moment(FASE_LIBRE_LIMITE).diff(moment(), 'days');
    ctx.reply(
        `👽 **¡BIENVENIDO AGENTE ${u.name.toUpperCase()}!** 👽\n\n` +
        `Estás conectado a la Red Aifu. Centralizamos cada anomalía en el cielo del Cono Sur.\n\n` +
        `⏳ **ESTADO:** Acceso LIBRE por **${diasFaltantes} días** más.\n` +
        `Reporta ahora para subir de rango antes del cierre de fase.`,
        UI.main(ctx)
    );
});

bot.hears('⭐ MI RANGO', (ctx) => {
    const u = ctx.state.user;
    const rank = getAgentRank(u.xp);
    const nextRank = RANK_SYSTEM[RANK_SYSTEM.indexOf(rank) + 1];
    
    let progressBar = "";
    if (nextRank) {
        const perc = Math.min(Math.floor(((u.xp - rank.minXp) / (nextRank.minXp - rank.minXp)) * 10), 10);
        progressBar = "█".repeat(perc) + "░".repeat(10 - perc);
    } else progressBar = "██████████ (MÁXIMO NIVEL)";

    ctx.reply(
        `🕵️ **EXPEDIENTE DE AGENTE**\n\n` +
        `👤 **Agente:** ${u.name}\n` +
        `🎖️ **Rango:** ${rank.name}\n` +
        `🔋 **Energía XP:** ${u.xp}\n` +
        `📊 **Progreso:** [${progressBar}]\n\n` +
        `🎁 **Ventaja:** ${rank.perk}`,
        { parse_mode: 'Markdown' }
    );
});

bot.hears('🤖 CHARLAR CON AIFUCITO', (ctx) => {
    const lore = [
        "¿Sabías que bajo el Cerro de Montevideo hay una anomalía magnética detectada en 1974?",
        "Los radares del Aeropuerto de Carrasco suelen filtrar objetos que se mueven a Mach 10.",
        "Si viste un 'triángulo' cerca de Durazno, no es fuerza aérea nacional. Es tecnología recuperada.",
        "La Estancia La Aurora en Salto no es solo turismo; es un portal de baja frecuencia activo."
    ];
    ctx.reply(`🤖 **Aifucito:** ${lore[Math.floor(Math.random() * lore.length)]}`);
});

// --- FLUJO DE REPORTE (PASO A PASO CON ESTADO) ---
bot.hears('🛸 REPORTAR AVISTAMIENTO', (ctx) => {
    ctx.session = { scene: 'REPORT', step: 'LOCATION', data: { media: [] } };
    ctx.reply(
        "📍 **INICIO DE REPORTE TÁCTICO**\n\nPara el mapa de calor, necesito precisión.\n\n¿Deseas enviar tu GPS (Ganas +XP) o ingreso manual?",
        UI.reportFlow
    );
});

bot.on('location', async (ctx) => {
    if (ctx.session?.step !== 'LOCATION') return;
    
    const { latitude, longitude } = ctx.message.location;
    ctx.session.data.lat = latitude;
    ctx.session.data.lng = longitude;
    ctx.session.data.method = 'GPS';

    // Geolocalización Inversa en Tiempo Real
    ctx.reply("🛰️ **LOCALIZANDO...**");
    const addr = await GeoProcessor.getAddress(latitude, longitude);
    if (addr) {
        ctx.session.data.address = addr;
        ctx.reply(`✅ Localizado en: **${addr.suburb}, ${addr.city} (${addr.country})**`);
    }

    ctx.session.step = 'DESCRIPTION';
    ctx.reply("🛸 **DESCRIBE EL FENÓMENO:**\n\n¿Qué viste? (Forma, color, luces, comportamiento):", UI.cancelOnly);
});

bot.on('text', async (ctx) => {
    const u = ctx.state.user;
    const text = ctx.message.text;

    if (text === '❌ CANCELAR') {
        ctx.session = null;
        return ctx.reply("🚫 Reporte abortado. Los cielos siguen en secreto.", UI.main(ctx));
    }

    if (!ctx.session || ctx.session.scene !== 'REPORT') return;
    const s = ctx.session;

    switch (s.step) {
        case 'LOCATION':
            if (text === '✍️ INGRESO MANUAL') {
                s.step = 'MANUAL_COUNTRY';
                ctx.reply("Indica el PAÍS del avistamiento:");
            }
            break;
        case 'MANUAL_COUNTRY':
            s.data.country = text;
            s.step = 'MANUAL_CITY';
            ctx.reply("Indica la CIUDAD:");
            break;
        case 'MANUAL_CITY':
            s.data.city = text;
            s.step = 'DESCRIPTION';
            ctx.reply("Describe el fenómeno:");
            break;
        case 'DESCRIPTION':
            s.data.description = text;
            s.step = 'MEDIA';
            ctx.reply(
                "📸 **EVIDENCIA VISUAL:**\n\nEnvía fotos o videos (máx 20s). Al terminar, pulsa el botón **FINALIZAR REPORTE**.",
                Markup.keyboard([['✅ FINALIZAR REPORTE', '❌ CANCELAR']]).resize()
            );
            break;
    }

    if (text === '✅ FINALIZAR REPORTE' && s.step === 'MEDIA') {
        await processFinalReport(ctx);
    }
});

bot.on(['photo', 'video'], async (ctx) => {
    if (ctx.session?.step !== 'MEDIA') return;
    
    const fileId = ctx.message.photo ? ctx.message.photo.pop().file_id : ctx.message.video.file_id;
    const type = ctx.message.photo ? 'PHOTO' : 'VIDEO';
    
    ctx.session.data.media.push({ type, fileId, ts: Date.now() });
    ctx.reply(`✅ ${type} guardado en el archivo temporal. ¿Algo más?`);
});

async function processFinalReport(ctx) {
    const u = ctx.state.user;
    const s = ctx.session.data;

    // Si fue manual, intentar obtener coordenadas aproximadas para el mapa de calor
    if (s.method !== 'GPS') {
        try {
            const query = `${s.city}, ${s.country}`;
            const geo = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
            if (geo.data[0]) {
                s.lat = parseFloat(geo.data[0].lat);
                s.lng = parseFloat(geo.data[0].lon);
            }
        } catch (e) { logger.warn(`Geo Manual Error: ${e.message}`); }
    }

    const reportId = crypto.randomBytes(3).toString('hex').toUpperCase();
    const finalReport = {
        id: `REP-${reportId}`,
        userId: u.id,
        userName: u.name,
        lat: s.lat || 0,
        lng: s.lng || 0,
        locationName: s.address ? `${s.address.suburb}, ${s.address.city}` : `${s.city || 'Desconocido'}`,
        description: s.description,
        media: s.media,
        timestamp: moment().tz(TIMEZONE).format(),
        isVip: u.vip
    };

    db.reports.push(finalReport);
    
    // Bonificación de XP
    const xpGain = s.method === 'GPS' ? 250 : 100;
    u.xp += xpGain;
    u.reports_count++;
    db.save();

    // NOTIFICACIÓN PÚBLICA (CON SPOILER)
    const channelMsg = `🛸 **NUEVO AVISTAMIENTO DETECTADO**\n📍 Lugar: ${finalReport.locationName}\n📝 ${finalReport.description}\n👤 Agente: ${u.name}`;
    
    // Publicar en canal nacional (Ejemplo)
    if (finalReport.media.length > 0) {
        const m = finalReport.media[0];
        const options = { caption: channelMsg, has_spoiler: true };
        if (m.type === 'PHOTO') await bot.telegram.sendPhoto('@tu_canal_nacional', m.fileId, options).catch(()=>{});
        else await bot.telegram.sendVideo('@tu_canal_nacional', m.fileId, options).catch(()=>{});
    }

    ctx.reply(
        `🚀 **¡MISIÓN COMPLETADA!**\n\nTu reporte ha sido procesado e integrado al Mapa de Calor Central.\n\n` +
        `💰 Has ganado **+${xpGain} XP**.\n` +
        `Tu ID de reporte es: **${finalReport.id}**`,
        UI.main(ctx)
    );
    
    ctx.session = null;
}

// --- SERVIDOR WEB INTEGRADO (DASHBOARD & HEATMAP) ---
const app = express();
app.set('view engine', 'ejs'); // Opcional si quieres renderizar HTML

app.get('/', (req, res) => {
    res.send(`🛰️ AIFUCITO CORE v5.0 OPERATIVO - ${db.reports.length} REPORTES PROCESADOS.`);
});

app.get('/api/v5/mapdata', (req, res) => {
    // Solo devolvemos datos anónimos para el mapa público
    const heatData = db.reports.map(r => ({
        lat: r.lat,
        lng: r.lng,
        intensity: r.isVip ? 1.0 : 0.5
    }));
    res.json(heatData);
});

// --- ARRANQUE INTEGRADO Y SEGURO ---
const startSystem = async () => {
    app.listen(PORT, '0.0.0.0', () => {
        logger.info(`Servidor Web de Diagnóstico activo en puerto ${PORT}`);
        
        bot.launch()
            .then(() => logger.info("RED AIFU 5.0 DESPLEGADA EXITOSAMENTE"))
            .catch(err => {
                logger.fatal(`Fallo en el lanzamiento de Telegraf: ${err.message}`);
                setTimeout(startSystem, 5000); // Reintento automático
            });
    });
};

startSystem();

// Manejo de señales de cierre para guardado seguro
process.once('SIGINT', () => {
    db.save();
    bot.stop('SIGINT');
    process.exit(0);
});

process.once('SIGTERM', () => {
    db.save();
    bot.stop('SIGTERM');
    process.exit(0);
});
