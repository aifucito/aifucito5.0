import { Telegraf, Markup, session } from "telegraf";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================
// 1. CONFIGURACIÓN DE RED Y SEGURIDAD
// ==========================================
const TOKEN = process.env.TELEGRAM_TOKEN;
const LOCATION_IQ_KEY = process.env.LOCATION_IQ_KEY;

// Canales de Inteligencia
const RED_AIFU = {
    CENTRAL: "-1002441094396", // Principal (Con Multimedia)
    RADAR_CONO_SUR: "-1002425624773", 
    GLOBAL: "-1002244400758", 
    AR: "-1002241680145",
    CH: "-1002287236531",
    UY: "-1002441995169"
};

// Disco Persistente en Render
const DATA_DIR = "/opt/render/project/src/data";
const MEDIA_DIR = path.join(DATA_DIR, "media");
const DB_PATH = path.join(DATA_DIR, "aifucito_db.json");

if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
let DB = { agentes: {}, reportes: [] };
if (fs.existsSync(DB_PATH)) {
    try { DB = JSON.parse(fs.readFileSync(DB_PATH, "utf8")); } catch (e) { console.error("⚠️ Iniciando DB..."); }
}

const guardarTodo = () => fs.writeFileSync(DB_PATH, JSON.stringify(DB, null, 4));

const bot = new Telegraf(TOKEN);
bot.use(session());

// ==========================================
// 2. FUNCIONES DE INTELIGENCIA
// ==========================================

async function getReverseGeo(lat, lon) {
    const url = `https://us1.locationiq.com/v1/reverse.php?key=${LOCATION_IQ_KEY}&lat=${lat}&lon=${lon}&format=json`;
    try {
        const res = await axios.get(url);
        const a = res.data.address;
        return {
            barrio: a.suburb || a.neighbourhood || a.residential || "Zona Rural",
            ciudad: a.city || a.town || a.village || "Desconocida",
            pais: a.country || "Desconocido"
        };
    } catch (e) { return null; }
}

function obtenerRango(u, id) {
    // Rango de Presidente para Damián
    if (id === 123456789) return "🛸 COMANDANTE INTERGALÁCTICO"; 
    
    const reps = u.reportes || 0;
    if (reps >= 120) return "🌠 Almirante de la Flota del Mate";
    if (reps >= 80) return "🛡️ Guardaespalda de Alf";
    if (reps >= 50) return "👨‍🚀 Reclutador de Marcianos Arrepentidos";
    if (reps >= 30) return "🛰️ Guía Turístico de la Vía Láctea";
    if (reps >= 15) return "🥩 Parrillero de Vacas Abducidas";
    if (reps >= 5) return "🔦 Cebador de Mate del Área 51";
    return "🧻 Fajinador de Retretes Espaciales";
}

function verificarAlertaRoja(ciudad) {
    const diezMinutos = 10 * 60 * 1000;
    const ahora = Date.now();
    const recientes = DB.reportes.filter(r => 
        r.ciudad === ciudad && (ahora - new Date(r.fechaIso).getTime()) < diezMinutos
    );
    return recientes.length >= 4; // Si hay 4 previos + este = 5
}

// ==========================================
// 3. COMANDOS Y FLUJO DEL BOT
// ==========================================

bot.start((ctx) => {
    const id = ctx.from.id;
    if (!DB.agentes[id]) {
        DB.agentes[id] = { nombre: ctx.from.first_name, reportes: 0, xp: 100 };
        guardarTodo();
    }
    ctx.reply(`🛰️ NODO AIFU ACTIVO\nBienvenido Agente ${ctx.from.first_name}.\n¿Deseas generar un reporte ahora?`, 
        Markup.keyboard([["SÍ, REPORTAR", "NO, LUEGO"]]).resize());
});

bot.hears("NO, LUEGO", (ctx) => {
    ctx.reply("Accediendo al sistema principal...", 
        Markup.keyboard([["🛸 GENERAR REPORTE", "🌍 RADAR"], ["🤖 IA AIFU", "⭐ MI PERFIL"]]).resize());
});

bot.hears(["SÍ, REPORTAR", "🛸 GENERAR REPORTE"], (ctx) => {
    ctx.session.reporte = { paso: "metodo" };
    ctx.reply("🛰️ SELECCIONA MÉTODO DE UBICACIÓN:", 
        Markup.keyboard([["📍 GPS AUTOMÁTICO", "⌨️ INGRESO MANUAL"], ["❌ Cancelar"]]).resize());
});

bot.on(["text", "location", "photo", "video"], async (ctx) => {
    const r = ctx.session.reporte;
    if (!r) return;

    // --- PASO 1: UBICACIÓN ---
    if (r.paso === "metodo") {
        if (ctx.message.location) {
            ctx.reply("📡 Sincronizando con satélites...");
            const geo = await getReverseGeo(ctx.message.location.latitude, ctx.message.location.longitude);
            r.lat = ctx.message.location.latitude;
            r.lng = ctx.message.location.longitude;
            r.pais = geo?.pais || "Desconocido";
            r.ciudad = geo?.ciudad || "Desconocida";
            r.barrio = geo?.barrio || "Zona Rural";
            r.paso = "descripcion";
            return ctx.reply(`📍 DETECTADO: ${r.barrio}, ${r.ciudad}\n\n✍️ Describe qué observaste:`);
        }
        if (ctx.message.text === "⌨️ INGRESO MANUAL") {
            r.paso = "pais_manual";
            return ctx.reply("Selecciona el país:", Markup.keyboard([["Uruguay", "Argentina", "Chile"], ["Otro"]]).resize());
        }
    }

    if (r.paso === "pais_manual") {
        if (ctx.message.text === "Otro") {
            r.paso = "escribir_pais";
            return ctx.reply("✍️ Escribe el nombre del PAÍS:");
        }
        r.pais = ctx.message.text;
        r.paso = "ciudad_manual";
        return ctx.reply(`Escribe la CIUDAD de ${r.pais}:`);
    }

    if (r.paso === "escribir_pais") {
        r.pais = ctx.message.text;
        r.paso = "ciudad_manual";
        return ctx.reply("Escribe la CIUDAD:");
    }

    if (r.paso === "ciudad_manual") {
        r.ciudad = ctx.message.text;
        r.paso = "barrio_manual";
        return ctx.reply("Escribe el BARRIO:");
    }

    if (r.paso === "barrio_manual") {
        r.barrio = ctx.message.text;
        r.paso = "descripcion";
        return ctx.reply("✍️ Describe lo que viste:");
    }

    // --- PASO 2: DESCRIPCIÓN Y MULTIMEDIA ---
    if (r.paso === "descripcion") {
        r.desc = ctx.message.text;
        r.paso = "multimedia";
        return ctx.reply("📸 EVIDENCIA HD\nEnvía una FOTO o VIDEO (max 20s). Si no tienes, escribe /saltar");
    }

    if (r.paso === "multimedia") {
        if (ctx.message.photo) {
            r.fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
            r.tipoFile = "photo";
        } else if (ctx.message.video) {
            r.fileId = ctx.message.video.file_id;
            r.tipoFile = "video";
        }
        r.paso = "confirmacion";
        const resumen = `📋 **RESUMEN TÁCTICO**\n📍 ${r.barrio}, ${r.ciudad} (${r.pais})\n🛸 ${r.desc}`;
        return ctx.reply(resumen + "\n\n¿El reporte es correcto?", 
            Markup.keyboard([["✅ DAR OK", "🔄 CORREGIR"]]).resize());
    }

    // --- PASO 3: ENVÍO FINAL ---
    if (r.paso === "confirmacion" && ctx.message.text === "✅ DAR OK") {
        const u = DB.agentes[ctx.from.id];
        u.reportes++;
        u.xp += 100;

        const hayAlerta = verificarAlertaRoja(r.ciudad);
        const fechaIso = new Date().toISOString();

        // Guardar para el Radar
        DB.reportes.push({ lat: r.lat, lng: r.lng, ciudad: r.ciudad, fechaIso });
        guardarTodo();

        // Ruteo de Canales
        const p = r.pais.toUpperCase();
        let canalNacional = RED_AIFU.GLOBAL;
        if (p === "URUGUAY") canalNacional = RED_AIFU.UY;
        else if (p === "ARGENTINA") canalNacional = RED_AIFU.AR;
        else if (p === "CHILE") canalNacional = RED_AIFU.CH;

        // Disparar Alerta Roja
        if (hayAlerta) {
            const msjA = `🚨 ¡ALERTA ROJA! 🚨\n📍 ${r.ciudad}, ${r.pais}\n⚠️ Avistamiento Masivo detectado.`;
            [canalNacional, RED_AIFU.CENTRAL, RED_AIFU.RADAR_CONO_SUR].forEach(c => ctx.telegram.sendMessage(c, msjA));
        }

        // Envío de Texto a Canal Nacional
        ctx.telegram.sendMessage(canalNacional, `📢 REPORTE: ${r.ciudad}\n📝 ${r.desc}`);

        // Envío Completo a Central (Multimedia)
        const cap = `🚨 REPORTE CENTRAL\n📍 ${r.barrio}, ${r.ciudad}\n👤 Agente: ${u.nombre}\n📝 ${r.desc}`;
        if (r.tipoFile === "photo") {
            ctx.telegram.sendPhoto(RED_AIFU.CENTRAL, r.fileId, { caption: cap });
        } else if (r.tipoFile === "video") {
            ctx.telegram.sendVideo(RED_AIFU.CENTRAL, r.fileId, { caption: cap });
        } else {
            ctx.telegram.sendMessage(RED_AIFU.CENTRAL, cap);
        }

        ctx.session.reporte = null;
        return ctx.reply(`✅ Reporte enviado, ${obtenerRango(u, ctx.from.id)}.`, 
            Markup.keyboard([["🛸 GENERAR REPORTE", "🌍 RADAR"], ["🤖 IA AIFU", "⭐ MI PERFIL"]]).resize());
    }
});

bot.hears("⭐ MI PERFIL", (ctx) => {
    const u = DB.agentes[ctx.from.id];
    ctx.reply(`🪪 **PERFIL AIFU**\n\n🎖️ RANGO: ${obtenerRango(u, ctx.from.id)}\n📊 TOTAL REPORTES: ${u.reportes}\n✨ XP: ${u.xp}`);
});

bot.hears("🌍 RADAR", (ctx) => ctx.reply(`🌍 RADAR TÁCTICO EN VIVO:\n${process.env.PUBLIC_URL}/radar`));

// ==========================================
// 4. SERVIDOR WEB Y MAPA
// ==========================================
const app = express();
app.use(express.static('public')); // Sirve CSS/JS de la carpeta public

// Ruta para el Mapa
app.get("/radar", (req, res) => res.sendFile(path.join(__dirname, "public", "mapa.html")));

// API para los puntos del mapa
app.get("/api/reportes", (req, res) => res.json(DB.reportes));

bot.launch();
app.listen(process.env.PORT || 10000, '0.0.0.0', () => console.log("🚀 NODO AIFU ONLINE"));
