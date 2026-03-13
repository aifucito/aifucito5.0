import { Telegraf, Markup, session } from "telegraf";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOKEN = process.env.TELEGRAM_TOKEN;
const LOCATION_IQ_KEY = process.env.LOCATION_IQ_KEY;

// Los IDs son OBLIGATORIOS para que el bot pueda publicar. 
// Los links son solo para que los usuarios se unan.
const RED_AIFU = {
    ID_CONO_SUR: "-1002388657640",
    ID_UY: "-1002347230353",
    ID_AR: "-1002410312674",
    ID_CH: "-1002283925519",
    ID_GLOBAL: "-1002414775486"
};

const DATA_DIR = "/opt/render/project/src/data";
const DB_PATH = path.join(DATA_DIR, "aifucito_db.json");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let DB = { agentes: {}, reportes: [] };
if (fs.existsSync(DB_PATH)) {
    try { DB = JSON.parse(fs.readFileSync(DB_PATH, "utf8")); } catch { console.log("DB nueva"); }
}

const bot = new Telegraf(TOKEN);
bot.use(session());

const menuPrincipal = () => Markup.keyboard([
    ["🛸 GENERAR REPORTE", "🌍 VER RADAR"],
    ["⭐ MI PERFIL", "❌ CANCELAR"]
]).resize();

bot.start((ctx) => {
    ctx.reply("🛰️ AIFUCITO ONLINE\nBienvenida al sistema de vigilancia.", menuPrincipal());
});

// --- INICIO DEL REPORTE ---
bot.hears("🛸 GENERAR REPORTE", (ctx) => {
    ctx.session = { reporte: { paso: "metodo" } };
    ctx.reply("¿Cómo quieres indicar la ubicación?", Markup.keyboard([
        ["📍 GPS (Automático)", "⌨️ MANUAL (Escribir)"],
        ["❌ CANCELAR"]
    ]).resize());
});

bot.on(["location", "text", "photo", "video"], async (ctx) => {
    if (!ctx.session?.reporte) return;
    const r = ctx.session.reporte;
    const msg = ctx.message.text;

    // BOTÓN DE EMERGENCIA PARA PUBLICAR
    if (msg === "🚀 FINALIZAR Y PUBLICAR") return finalizarReporte(ctx, r);
    if (msg === "❌ CANCELAR") { ctx.session = null; return ctx.reply("Cancelado.", menuPrincipal()); }

    // 1. ELEGIR MÉTODO
    if (r.paso === "metodo") {
        if (ctx.message.location) {
            r.lat = ctx.message.location.latitude;
            r.lng = ctx.message.location.longitude;
            try {
                const g = await axios.get(`https://us1.locationiq.com/v1/reverse.php?key=${LOCATION_IQ_KEY}&lat=${r.lat}&lon=${r.lng}&format=json`);
                r.pais = g.data.address.country || "Desconocido";
                r.ciudad = g.data.address.city || g.data.address.town || "S/D";
                r.barrio = g.data.address.suburb || "";
            } catch { r.pais = "Desconocido"; }
            r.paso = "descripcion";
            return ctx.reply("📍 GPS capturado. ¿Qué viste en el cielo?", Markup.removeKeyboard());
        }
        if (msg === "⌨️ MANUAL (Escribir)") {
            r.paso = "pais";
            return ctx.reply("Escribe el PAÍS del avistamiento:", Markup.removeKeyboard());
        }
        if (msg === "📍 GPS (Automático)") {
            return ctx.reply("Por favor, presiona el botón de abajo que dice 'Enviar mi ubicación' o adjunta tu ubicación actual.");
        }
    }

    // 2. FLUJO MANUAL
    if (r.paso === "pais") { r.pais = msg; r.paso = "ciudad"; return ctx.reply("Escribe la CIUDAD:"); }
    if (r.paso === "ciudad") { r.ciudad = msg; r.paso = "barrio"; return ctx.reply("Escribe el BARRIO (o pon 'No'):"); }
    if (r.paso === "barrio") {
        r.barrio = msg.toLowerCase() === "no" ? "" : msg;
        r.paso = "descripcion";
        return ctx.reply("Perfecto. Ahora describe ¿Qué viste en el cielo?");
    }

    // 3. DESCRIPCIÓN Y MOVIMIENTO
    if (r.paso === "descripcion" && msg) {
        r.desc = msg; r.paso = "movimiento";
        return ctx.reply("¿Tenía movimiento?", Markup.keyboard([["SÍ", "NO", "ERRÁTICO"]]).resize());
    }

    if (r.paso === "movimiento" && msg) {
        r.mov = msg; r.paso = "media";
        return ctx.reply("Envía una FOTO o VIDEO (o presiona el botón si no tienes):", Markup.keyboard([["🚫 SIN EVIDENCIA"]]).resize());
    }

    // 4. EVIDENCIA Y CIERRE
    if (r.paso === "media") {
        if (ctx.message.photo) { r.fileId = ctx.message.photo.pop().file_id; r.tipo = "foto"; }
        else if (ctx.message.video) { r.fileId = ctx.message.video.file_id; r.tipo = "video"; }
        
        r.paso = "confirmar";
        return ctx.reply("Todo listo. Presiona el botón para informar a la red AIFU.", 
            Markup.keyboard([["🚀 FINALIZAR Y PUBLICAR"], ["❌ CANCELAR"]]).resize());
    }
});

async function finalizarReporte(ctx, r) {
    const texto = `🚨 NUEVO AVISTAMIENTO\n\n📍 ${r.barrio ? r.barrio + ', ' : ''}${r.ciudad}, ${r.pais}\n👤 Agente: ${ctx.from.first_name}\n🚀 Movimiento: ${r.mov}\n\n📝 ${r.desc}`;
    
    let destinos = [RED_AIFU.ID_CONO_SUR];
    const p = (r.pais || "").toLowerCase();
    
    if (p.includes("uruguay")) destinos.push(RED_AIFU.ID_UY);
    else if (p.includes("argentina")) destinos.push(RED_AIFU.ID_AR);
    else if (p.includes("chile")) destinos.push(RED_AIFU.ID_CH);
    else destinos.push(RED_AIFU.ID_GLOBAL);

    for (const id of destinos) {
        try {
            if (r.fileId) {
                if (r.tipo === "foto") await bot.telegram.sendPhoto(id, r.fileId, { caption: texto });
                else await bot.telegram.sendVideo(id, r.fileId, { caption: texto });
            } else {
                await bot.telegram.sendMessage(id, texto);
            }
        } catch (e) { console.error("Error enviando: " + e.message); }
    }

    ctx.session = null;
    return ctx.reply("✅ ¡Reporte publicado con éxito en la red!", menuPrincipal());
}

// Server básico para Render
const app = express();
app.get("/", (req, res) => res.send("AIFUCITO VIVO"));
app.listen(process.env.PORT || 10000);
bot.launch();
