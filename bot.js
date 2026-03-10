import { Telegraf, Markup, session } from "telegraf";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import axios from "axios";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CONFIGURACIÓN DE VARIABLES DE ENTORNO
const TOKEN = process.env.TELEGRAM_TOKEN;
const LOCATION_IQ_KEY = process.env.LOCATION_IQ_KEY;
const PUBLIC_URL = process.env.PUBLIC_URL; 

const RED_AIFU = {
    ID_CONO_SUR: "-1002425624773", 
    LINK_CONO_SUR: "https://t.me/+YqA6d3VpKv9mZjU5",
    LINK_GLOBAL: "https://t.me/+r5XfcJma3g03MWZh",
    LINK_AR: "https://t.me/+QpErPk26SY05OGIx",
    LINK_CH: "https://t.me/+VP2T47eLvIowNmYx",
    LINK_UY: "https://t.me/+nCVD4NsOihIyNGFh"
};

// PERSISTENCIA DE DATOS EN RENDER
const DATA_DIR = "/opt/render/project/src/data";
const DB_PATH = path.join(DATA_DIR, "aifucito_db.json");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let DB = { agentes: {}, reportes: [] };
if (fs.existsSync(DB_PATH)) {
    try { 
        const data = fs.readFileSync(DB_PATH, "utf8");
        DB = JSON.parse(data); 
    } catch (e) { console.error("Error cargando DB:", e); }
}

const guardarDB = () => {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(DB, null, 4));
    } catch (e) { console.error("Error guardando DB:", e); }
};

const bot = new Telegraf(TOKEN);
bot.use(session());

// LÓGICA DE RANGOS AIFU
function obtenerRango(usuario, id) {
    if (id == 7662736311) return "🛸 COMANDANTE INTERGALÁCTICO"; 
    const r = usuario.reportes || 0;
    if (r >= 10) return "👽 Investigador Senior";
    if (r >= 5) return "🔦 Cebador de Mate del Área 51";
    return "🧻 Fajinador de Retretes Espaciales";
}

const menuPrincipal = () => Markup.keyboard([
    ["🛸 GENERAR REPORTE", "🌍 VER RADAR"],
    ["🔗 UNIRSE A MI GRUPO", "⭐ MI PERFIL"]
]).resize();

// --- COMANDOS ---

bot.start((ctx) => {
    const id = ctx.from.id;
    if (!DB.agentes[id]) {
        DB.agentes[id] = { 
            nombre: ctx.from.first_name, 
            reportes: 0, 
            token: crypto.randomBytes(8).toString('hex') 
        };
        guardarDB();
    }
    ctx.reply(`🛰️ NODO AIFUCITO ONLINE\n\nBienvenido al sistema de reporte de la AIFU.`, menuPrincipal());
});

bot.hears("⭐ MI PERFIL", (ctx) => {
    const u = DB.agentes[ctx.from.id];
    if (!u) return ctx.reply("Por favor, usa /start para registrarte.");
    ctx.reply(`🪪 PERFIL DE AGENTE\n\n👤 Nombre: ${u.nombre}\n🎖️ Rango: ${obtenerRango(u, ctx.from.id)}\n📊 Reportes: ${u.reportes}\n🆔 ID: ${ctx.from.id}`);
});

bot.hears("🌍 VER RADAR", (ctx) => {
    const u = DB.agentes[ctx.from.id];
    if (!u) return ctx.reply("Usa /start primero.");
    const authUrl = `${PUBLIC_URL}/?auth=${u.token}`;
    ctx.reply(`🛰️ ACCESO AL RADAR SEGURO:`, Markup.inlineKeyboard([[Markup.button.url("ABRIR MAPA EN VIVO 🛰️", authUrl)]]));
});

bot.hears("🔗 UNIRSE A MI GRUPO", (ctx) => {
    const botones = [
        [Markup.button.url("Uruguay 🇺🇾", RED_AIFU.LINK_UY), Markup.button.url("Argentina 🇦🇷", RED_AIFU.LINK_AR)],
        [Markup.button.url("Chile 🇨🇱", RED_AIFU.LINK_CH), Markup.button.url("Global 👽", RED_AIFU.LINK_GLOBAL)]
    ];
    if (ctx.from.id == 7662736311) botones.push([Markup.button.url("🔥 RADAR CONO SUR (VIP)", RED_AIFU.LINK_CONO_SUR)]);
    ctx.reply("Selecciona tu zona de operación:", Markup.inlineKeyboard(botones));
});

// --- SISTEMA DE REPORTES ---

bot.hears("🛸 GENERAR REPORTE", (ctx) => {
    ctx.session = { reporte: { paso: "ubicacion", lat: -34.9011, lng: -56.1645 } }; 
    ctx.reply("📍 ¿Dónde ocurrió el avistamiento?", Markup.keyboard([
        ["📍 ENVIAR MI GPS", "⌨️ ESCRIBIR CIUDAD"], 
        ["❌ CANCELAR"]
    ]).resize());
});

bot.hears("❌ CANCELAR", (ctx) => {
    ctx.session = null;
    ctx.reply("Reporte cancelado.", menuPrincipal());
});

// --- BLOQUE DE UBICACIÓN Y GEOLOCALIZACIÓN MEJORADO ---
bot.on(["location", "text", "photo", "video"], async (ctx) => {
    if (!ctx.session?.reporte) return;
    const r = ctx.session.reporte;

    // --- 1. UBICACIÓN ---
    if (r.paso === "ubicacion") {

        // CASO GPS
        if (ctx.message?.location) {
            r.lat = ctx.message.location.latitude;
            r.lng = ctx.message.location.longitude;
            try {
                const res = await axios.get(`https://us1.locationiq.com/v1/reverse.php`, {
                    params: {
                        key: LOCATION_IQ_KEY,
                        lat: r.lat,
                        lon: r.lng,
                        format: "json"
                    }
                });

                r.pais = res.data.address.country || "Uruguay";
                r.ciudad = res.data.address.city || res.data.address.town || res.data.address.village || "Desconocida";
                r.paso = "int_1";

                console.log("DEBUG GPS:", r.lat, r.lng, r.ciudad, r.pais);

                return ctx.reply(`📍 Ubicación detectada: ${r.ciudad}, ${r.pais}.\n\n¿Qué viste en el cielo? Descríbelo:`, Markup.removeKeyboard());

            } catch (e) {
                console.error("Error reverse geocoding GPS:", e);
                r.paso = "m_pais";
                return ctx.reply("⚠️ No pudimos obtener tu ubicación exacta. Por favor escribe el PAÍS manualmente:", Markup.removeKeyboard());
            }
        }

        // CASO MANUAL
        if (ctx.message?.text?.includes("ESCRIBIR CIUDAD")) {
            r.paso = "m_pais";
            return ctx.reply("Escribe el PAÍS del avistamiento:", Markup.removeKeyboard());
        }

        return;
    }

    // --- 2. PASOS MANUALES ---
    if (r.paso === "m_pais" && ctx.message?.text) {
        r.pais = ctx.message.text.trim();
        r.paso = "m_ciudad";
        return ctx.reply("Escribe la CIUDAD:");
    }

    if (r.paso === "m_ciudad" && ctx.message?.text) {
        r.ciudad = ctx.message.text.trim();
        r.paso = "int_1";

        try {
            const query = `${r.ciudad}, ${r.pais}`;
            const geoRes = await axios.get(`https://us1.locationiq.com/v1/search.php`, {
                params: {
                    key: LOCATION_IQ_KEY,
                    q: query,
                    format: "json",
                    limit: 1
                }
            });

            if (geoRes.data && geoRes.data.length > 0) {
                r.lat = parseFloat(geoRes.data[0].lat);
                r.lng = parseFloat(geoRes.data[0].lon);
            } else {
                r.lat = -34.9011;
                r.lng = -56.1645;
                console.warn("No se encontraron coordenadas, usando fallback Montevideo.");
            }

            console.log("DEBUG ciudad manual:", r.lat, r.lng, r.ciudad, r.pais);
        } catch (e) {
            console.error("Error geolocalizando ciudad manual:", e);
            r.lat = -34.9011;
            r.lng = -56.1645;
        }

        return ctx.reply("¿Qué viste en el cielo? (Luz, objeto, forma, etc.)");
    }

    // --- 3. DESCRIPCIÓN Y MOVIMIENTO ---
    if (r.paso === "int_1" && ctx.message?.text) {
        r.desc = ctx.message.text.trim();
        r.paso = "int_2";
        return ctx.reply("¿El objeto tenía movimiento inteligente o errático?", Markup.keyboard([
            ["SÍ", "NO", "ERRÁTICO"]
        ]).oneTime().resize());
    }

    if (r.paso === "int_2" && ctx.message?.text) {
        r.mov = ctx.message.text.trim();
        r.paso = "multimedia";
        return ctx.reply("📸 ¿Tienes evidencia? Envía la FOTO o VIDEO ahora.\n\nSi no tienes, presiona el botón:", Markup.keyboard([
            ["🚫 SIN EVIDENCIA (SOLO TEXTO)"], ["❌ CANCELAR"]
        ]).resize());
    }

    // --- 4. MULTIMEDIA Y FINALIZACIÓN ---
    if (r.paso === "multimedia") {
        if (ctx.message?.text === "🚫 SIN EVIDENCIA (SOLO TEXTO)" || ctx.message?.photo || ctx.message?.video) {
            if (ctx.message?.photo) {
                r.fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
                r.tipo = "foto";
            } else if (ctx.message?.video) {
                r.fileId = ctx.message.video.file_id;
                r.tipo = "video";
            }
            return await finalizarReporte(ctx, r);
        }
    }
});

// --- FINALIZAR REPORTE ---
async function finalizarReporte(ctx, r) {
    const u = DB.agentes[ctx.from.id];
    if (u) u.reportes++;

    const nuevoReporte = {
        lat: r.lat,
        lng: r.lng,
        pais: r.pais || "Uruguay",
        ciudad: r.ciudad || "Manual",
        fecha: new Date(),
        tipo: r.desc,
        movimiento: r.mov,
        agente: u ? u.nombre : "Agente Anónimo"
    };

    DB.reportes.push(nuevoReporte);
    guardarDB();

    const txtCanal = `🚨 NUEVO INFORME DE AVISTAMIENTO\n\n📍 Ubicación: ${nuevoReporte.ciudad}, ${nuevoReporte.pais}\n👤 Agente: ${nuevoReporte.agente}\n🚀 Movimiento: ${nuevoReporte.movimiento}\n📝 Descripción: ${nuevoReporte.tipo}`;
    
    try {
        if (r.fileId) {
            if (r.tipo === "foto") await ctx.telegram.sendPhoto(RED_AIFU.ID_CONO_SUR, r.fileId, { caption: txtCanal });
            else await ctx.telegram.sendVideo(RED_AIFU.ID_CONO_SUR, r.fileId, { caption: txtCanal });
        } else {
            await ctx.telegram.sendMessage(RED_AIFU.ID_CONO_SUR, txtCanal);
        }
    } catch (e) { console.error("Error al notificar al canal:", e); }

    ctx.session = null;
    return ctx.reply(`✅ REPORTE FINALIZADO\n\nGracias Agente ${u.nombre}. Tu informe ha sido integrado al Radar AIFU y subido a la base de datos central.`, menuPrincipal());
}

// --- SERVIDOR WEB ---
const app = express();
app.use(express.static('public'));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/api/reportes", (req, res) => res.json(DB.reportes));

// LANZAMIENTO
bot.launch();
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`AIFUCITO activo en puerto ${PORT}`));

// Manejo de cierre limpio
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
