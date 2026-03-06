/**
 * ==================================================================================
 * 🛰️ AIFUCITO OMEGA CORE v6.3 - INTELIGENCIA GEOGRÁFICA
 * Fusión: GPS Automático + Geocodificación Manual Real + Multimedia + Canales
 * ==================================================================================
 */

import { Telegraf, Markup, session } from "telegraf";
import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import fetch from "node-fetch"; // Para buscar coordenadas de texto

// --- CONFIGURACIÓN ---
const CANALES = {
    GLOBAL: "-1002388657640",
    URUGUAY: "-1002347230353",
    ARGENTINA: "-1002410312674",
    CHILE: "-1002283925519"
};

const TOKEN = process.env.BOT_TOKEN || "8701174108:AAFgEE-uSZlDvrTNm_QIeDIINqmnCzQIOCM";
const PORT = process.env.PORT || 10000;
const PUBLIC_URL = "https://aifucito.onrender.com";

// --- BASE DE DATOS ---
const DB_PATH = "./aifucito_db.json";
let DB = { agentes: {}, reportes: [] };

if (fs.existsSync(DB_PATH)) {
    DB = JSON.parse(fs.readFileSync(DB_PATH));
}
const guardarDB = () => fs.writeFileSync(DB_PATH, JSON.stringify(DB, null, 2));

// --- RANGOS ---
const RANGOS = [
    { nombre: "Iniciado Estelar 🛸", xp: 0 },
    { nombre: "Vigía de la Red 📡", xp: 1500 },
    { nombre: "Cazador de Anomalías 🔭", xp: 5000 },
    { nombre: "Maestro de la Verdad 👽", xp: 15000 }
];
const calcularRango = (xp) => [...RANGOS].reverse().find(r => xp >= r.xp);

// --- IA LOCAL ---
const IA_Responder = (texto) => {
    const t = texto.toLowerCase();
    if (t.includes("hola")) return "Sistema AIFUCITO activo. Esperando órdenes.";
    if (t.includes("ovni")) return "Fenómeno no identificado. No responde a transpondedores civiles.";
    if (t.includes("nasa")) return "La NASA desvía la atención. La verdad ocurre en las estaciones privadas.";
    return "Analizando datos... la señal es difusa. Sé más específico.";
};

// --- FUNCIÓN DE GEOCODIFICACIÓN (TEXTO -> COORDENADAS) ---
async function buscarCoordenadas(lugar) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(lugar)}&limit=1`);
        const data = await response.json();
        if (data && data.length > 0) {
            return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        }
        return null; // Si no encuentra nada
    } catch (e) {
        console.error("Error Geocoder:", e);
        return null;
    }
}

const bot = new Telegraf(TOKEN);
bot.use(session());

const mainMenu = () => Markup.keyboard([
    ["🛸 REPORTAR AVISTAMIENTO", "🌍 RADAR GLOBAL"],
    ["🤖 IA", "⭐ MI PERFIL"]
]).resize();

// --- INICIO ---
bot.start(ctx => {
    const id = ctx.from.id;
    if (!DB.agentes[id]) {
        DB.agentes[id] = { id, nombre: ctx.from.first_name, xp: 0, reportes: 0, rango: "Iniciado Estelar 🛸" };
        guardarDB();
    }
    ctx.reply("🛰️ NODO AIFUCITO OMEGA v6.3 ONLINE.", mainMenu());
});

bot.hears("⭐ MI PERFIL", ctx => {
    const ag = DB.agentes[ctx.from.id];
    ctx.reply(`🕵️ EXPEDIENTE:\n\nAgente: ${ag.nombre}\nRango: ${ag.rango}\nXP: ${ag.xp}\nReportes: ${ag.reportes}`);
});

bot.hears("🤖 IA", ctx => {
    ctx.session.ia = true;
    ctx.reply("📡 CANAL IA ABIERTO. Escribe tu duda o 'SALIR'.");
});

// --- REPORTE ---
bot.hears("🛸 REPORTAR AVISTAMIENTO", ctx => {
    ctx.session.reporte = { step: "tipo" };
    ctx.reply("Tipo de fenómeno:", Markup.keyboard([["OVNI", "Luz extraña"], ["Entidad", "Otro"], ["❌ CANCELAR"]]).resize());
});

bot.hears(["OVNI", "Luz extraña", "Entidad", "Otro"], ctx => {
    if (!ctx.session?.reporte) return;
    ctx.session.reporte.tipo = ctx.message.text;
    ctx.session.reporte.step = "ubicacion";
    ctx.reply("Indica ubicación:", Markup.keyboard([[Markup.button.locationRequest("📍 Enviar GPS")], ["✍️ Ubicación manual"], ["❌ CANCELAR"]]).resize());
});

bot.on("location", ctx => {
    if (ctx.session?.reporte?.step !== "ubicacion") return;
    ctx.session.reporte.lat = ctx.message.location.latitude;
    ctx.session.reporte.lng = ctx.message.location.longitude;
    ctx.session.reporte.lugar = "GPS Automático";
    ctx.session.reporte.step = "descripcion";
    ctx.reply("📍 GPS Registrado. Describe el fenómeno:");
});

bot.hears("✍️ Ubicación manual", ctx => {
    if (!ctx.session?.reporte) return;
    ctx.session.reporte.step = "manual_input";
    ctx.reply("Ingresa: País, Ciudad, Barrio y Referencia (opcional).");
});

// --- MANEJADOR DE TEXTO (IA + MANUAL + DESC) ---
bot.on("text", async (ctx) => {
    const text = ctx.message.text;
    if (text === "❌ CANCELAR") { ctx.session = null; return ctx.reply("Abortado.", mainMenu()); }

    if (ctx.session?.ia) {
        if (text.toUpperCase() === "SALIR") { ctx.session.ia = false; return ctx.reply("IA Offline.", mainMenu()); }
        return ctx.reply("🤖 AIFUCITO: " + IA_Responder(text));
    }

    if (!ctx.session?.reporte) return;

    // Paso Manual: Buscar coordenadas reales del texto ingresado
    if (ctx.session.reporte.step === "manual_input") {
        ctx.reply("🔍 Buscando coordenadas del sector...");
        const coords = await buscarCoordenadas(text);
        
        if (coords) {
            ctx.session.reporte.lat = coords.lat;
            ctx.session.reporte.lng = coords.lng;
            ctx.session.reporte.lugar = text;
            ctx.session.reporte.step = "descripcion";
            return ctx.reply(`✅ Ubicación detectada (${coords.lat}, ${coords.lng}).\nDescribe el fenómeno:`);
        } else {
            return ctx.reply("❌ No pude localizar ese punto. Intenta ser más específico (País, Ciudad, Barrio):");
        }
    }

    // Descripción
    if (ctx.session.reporte.step === "descripcion") {
        ctx.session.reporte.descripcion = text;
        ctx.session.reporte.step = "media";
        return ctx.reply("📸 Envía foto/video o escribe 'FIN'.", Markup.keyboard([["FIN"], ["❌ CANCELAR"]]).resize());
    }

    if (text.toUpperCase() === "FIN" && ctx.session.reporte.step === "media") {
        return finalizarReporte(ctx);
    }
});

// --- MULTIMEDIA ---
bot.on(["photo", "video"], async (ctx) => {
    if (ctx.session?.reporte?.step !== "media") return;
    ctx.session.reporte.media = ctx.message.photo ? ctx.message.photo.pop().file_id : ctx.message.video.file_id;
    ctx.session.reporte.mediaType = ctx.message.photo ? "photo" : "video";
    return finalizarReporte(ctx);
});

// --- CIERRE ---
async function finalizarReporte(ctx) {
    const r = ctx.session.reporte;
    const ag = DB.agentes[ctx.from.id];

    const reporteFinal = {
        id: crypto.randomBytes(3).toString("hex"),
        tipo: r.tipo,
        descripcion: r.descripcion,
        lat: r.lat,
        lng: r.lng,
        lugar: r.lugar,
        media: r.media || null,
        mediaType: r.mediaType || null,
        agente: ag.nombre
    };

    DB.reportes.push(reporteFinal);
    ag.xp += 500;
    ag.reportes++;
    ag.rango = calcularRango(ag.xp).nombre;
    guardarDB();

    const alerta = `🚨 ALERTA AIFU\n\nTipo: ${r.tipo}\nLugar: ${r.lugar}\nAgente: ${ag.nombre}\nDetalle: ${r.descripcion}`;
    
    for (const c of Object.values(CANALES)) {
        try {
            if (reporteFinal.media) {
                if (reporteFinal.mediaType === "photo") await bot.telegram.sendPhoto(c, reporteFinal.media, { caption: alerta });
                else await bot.telegram.sendVideo(c, reporteFinal.media, { caption: alerta });
            } else await bot.telegram.sendMessage(c, alerta);
        } catch (e) {}
    }

    ctx.session = null;
    ctx.reply("✅ REPORTE ENVIADO AL RADAR.", mainMenu());
}

bot.hears("🌍 RADAR GLOBAL", ctx => {
    const t = crypto.randomBytes(8).toString("hex");
    ctx.reply(`🛰️ RADAR VIVO:\n${PUBLIC_URL}/radar?token=${t}`);
});

// --- WEB ---
const app = express();
app.get("/radar", (req, res) => {
    res.send(`<html><head><link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css"/><style>#map{height:100vh;width:100vw;margin:0}</style></head>
    <body style="margin:0"><div id="map"></div><script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
    <script>var map=L.map('map').setView([-34.6,-58.4],5);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    const data=${JSON.stringify(DB.reportes)}; data.forEach(r=>{if(r.lat&&r.lng)L.marker([r.lat,r.lng]).addTo(map).bindPopup("<b>"+r.tipo+"</b><br>"+r.descripcion);});</script>
    </body></html>`);
});

app.listen(PORT, "0.0.0.0", () => {
    console.log("Servidor Online");
    bot.launch();
});
