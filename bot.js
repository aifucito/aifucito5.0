import { Telegraf, Markup, session } from "telegraf";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================
// CONFIGURACIÓN DE VARIABLES
// ==========================================
const TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 10000;
const PUBLIC_URL = process.env.PUBLIC_URL || "https://aifucito5-0.onrender.com";
const GEMINI_KEY = process.env.GEMINI_API_KEY; // Para la IA

// BASE DE DATOS LOCAL
const DB_PATH = "./aifucito_db.json";
let DB = { agentes: {}, reportes: [], historias: [] };

if (fs.existsSync(DB_PATH)) {
    try {
        DB = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    } catch (e) { console.log("⚠️ Error en DB, reiniciando..."); }
}

const guardarTodo = () => fs.writeFileSync(DB_PATH, JSON.stringify(DB, null, 4));

// ==========================================
// FUNCIÓN IA (GEMINI) - CONEXIÓN EXTERNA
// ==========================================
async function hablarIA(pregunta) {
    if (!GEMINI_KEY) return "El canal de IA está offline (Falta API KEY).";
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;
        const response = await fetch(url, {
            method: "POST",
            body: JSON.stringify({
                contents: [{ parts: [{ text: `Eres AIFUCITO, asistente de la Asociación AIFU Uruguay. Responde con tono uruguayo, experto en OVNIS y misterios. Pregunta: ${pregunta}` }] }]
            })
        });
        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    } catch (e) { return "Interferencia en la señal de la IA..."; }
}

// ==========================================
// LÓGICA DEL BOT DE TELEGRAM
// ==========================================
const bot = new Telegraf(TOKEN);
bot.use(session());

const menuPrincipal = () => Markup.keyboard([
    ["🛸 REPORTAR AVISTAMIENTO", "🌍 VER RADAR"],
    ["🤖 CHARLAR CON AIFUCITO", "⭐ MI PERFIL"]
]).resize();

bot.start((ctx) => {
    const id = ctx.from.id;
    if (!DB.agentes[id]) {
        DB.agentes[id] = { nombre: ctx.from.first_name, reportes: 0, xp: 100 };
        guardarTodo();
    }
    ctx.reply(`🛰️ NODO AIFU URUGUAY ACTIVO\nBienvenido Agente ${ctx.from.first_name}.`, menuPrincipal());
});

// --- REPORTE CON GPS ---
bot.hears("🛸 REPORTAR AVISTAMIENTO", (ctx) => {
    ctx.session.reporte = { paso: "tipo" };
    ctx.reply("🛸 MODO REPORTE\n¿Qué tipo de objeto observaste? (Ej: Esfera, Triángulo, Luces)");
});

bot.on("text", async (ctx, next) => {
    if (ctx.message.text === "❌ Cancelar") {
        ctx.session.reporte = null;
        ctx.session.ia = false;
        return ctx.reply("Operación cancelada.", menuPrincipal());
    }

    // Lógica de Reporte
    if (ctx.session.reporte && ctx.session.reporte.paso === "tipo") {
        ctx.session.reporte.tipo = ctx.message.text;
        ctx.session.reporte.paso = "gps";
        return ctx.reply("📍 ENVIAR UBICACIÓN\nToca el clip 📎 y selecciona 'Ubicación' para marcar el punto exacto en el radar.", 
            Markup.keyboard([["❌ Cancelar"]]).resize());
    }

    // Lógica de Chat IA
    if (ctx.session.ia) {
        await ctx.sendChatAction("typing");
        const rpa = await hablarIA(ctx.message.text);
        return ctx.reply(rpa);
    }
    return next();
});

bot.on("location", async (ctx) => {
    if (ctx.session.reporte && ctx.session.reporte.paso === "gps") {
        const { latitude, longitude } = ctx.message.location;
        const rID = crypto.randomBytes(2).toString("hex").toUpperCase();

        DB.reportes.push({
            id: rID,
            agente: ctx.from.first_name,
            tipo: ctx.session.reporte.tipo,
            lat: latitude,
            lng: longitude,
            fecha: new Date().toLocaleString('es-UY')
        });

        DB.agentes[ctx.from.id].reportes++;
        DB.agentes[ctx.from.id].xp += 50;
        guardarTodo();

        ctx.session.reporte = null;
        ctx.reply(`✅ REPORTE ARCHIVADO [ID: ${rID}]\nSe ha actualizado el radar global.`, menuPrincipal());
    }
});

bot.hears("🤖 CHARLAR CON AIFUCITO", (ctx) => {
    ctx.session.ia = true;
    ctx.reply("👽 Canal abierto. Pregúntame lo que quieras sobre el fenómeno UAP o la asociación. (Escribe '❌ Cancelar' para salir)");
});

bot.hears("🌍 VER RADAR", (ctx) => {
    ctx.reply(`🛰️ ACCESO AL RADAR TÁCTICO:\n${PUBLIC_URL}/radar`);
});

bot.hears("⭐ MI PERFIL", (ctx) => {
    const u = DB.agentes[ctx.from.id];
    ctx.reply(`🪪 AGENTE: ${u.nombre}\nRANKING: Investigador Nivel ${(u.xp/100).toFixed(0)}\nREPORTES: ${u.reportes}`);
});

// ==========================================
// SERVIDOR WEB Y RADAR VISUAL
// ==========================================
const app = express();

app.get("/radar", (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>AIFU RADAR</title>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <style>
            body { margin: 0; background: #000; color: #0f0; font-family: monospace; }
            #map { height: 100vh; width: 100vw; }
            .ui { position: absolute; top: 10px; left: 50px; z-index: 1000; background: rgba(0,20,0,0.8); border: 1px solid #0f0; padding: 10px; }
        </style>
    </head>
    <body>
        <div class="ui">🛰️ AIFU RADAR: MONITOREO EN VIVO</div>
        <div id="map"></div>
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <script>
            var map = L.map('map').setView([-32.522779, -55.765835], 7);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);

            fetch('/api/reportes').then(r => r.json()).then(data => {
                data.forEach(r => {
                    L.marker([r.lat, r.lng]).addTo(map)
                    .bindPopup("<b>"+r.tipo+"</b><br>Agente: "+r.agente+"<br>"+r.fecha);
                });
            });
        </script>
    </body>
    </html>
    `);
});

app.get("/api/reportes", (req, res) => res.json(DB.reportes));

// ARRANQUE SEGURO
bot.launch().then(() => console.log("🛰️ BOT ONLINE"));
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 SERVER ONLINE`));

// Para que no se apague por errores
process.on('unhandledRejection', (reason, promise) => {
    console.log('Unhandled Rejection at:', promise, 'reason:', reason);
});
