import "dotenv/config";
import { Telegraf, Markup, session } from "telegraf";
import axios from "axios";
import express from "express";
import { createClient } from "@supabase/supabase-js";

/* =========================
   CONFIGURACIÓN DE NÚCLEO
========================= */
const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const ADMIN_ID = String(process.env.ADMIN_ID);

const app = express();
app.get("/", (_, res) => res.send("AIFUCITO V5.0: SISTEMA OPERATIVO 🚀"));
app.listen(process.env.PORT || 3000, "0.0.0.0");

const STATE = { 
  IDLE: "idle", 
  WAIT_GPS: "wait_gps", 
  WAIT_DESC: "wait_desc", 
  IA: "ia", 
  CONFIRM: "confirm" 
};

/* =========================
   MIDDLEWARE: SESIÓN PERSISTENTE (TABLA SESIONES)
========================= */
bot.use(async (ctx, next) => {
  if (!ctx.from) return next();
  const id = String(ctx.from.id);

  try {
    // Recuperar sesión de la base de datos
    const { data } = await supabase.from("sesiones").select("data").eq("id", id).maybeSingle();
    ctx.session = data?.data || { state: STATE.IDLE };
    
    await next();

    // Guardar rastro de la sesión al finalizar el turno
    await supabase.from("sesiones").upsert({ id, data: ctx.session, updated_at: new Date() });
  } catch (error) {
    console.error("Error en persistencia de sesión:", error);
    return next();
  }
});

/* =========================
   UTILIDADES & RANGOS (TU PERSONALIDAD)
========================= */
function menu() {
  return Markup.keyboard([
    ["📍 Reportar"], 
    ["🗺 Mapa"], 
    ["🤖 Aifucito", "👤 Perfil"]
  ]).resize();
}

function obtenerRango(r = 0, id = "") {
  if (String(id) === ADMIN_ID) return "👑 Comandante Intergaláctico";
  if (r >= 25) return "🛸 CRIDOVNI";
  if (r >= 15) return "🛡️ Guardaespaldas de Alf";
  if (r >= 10) return "🛰️ Guardaespaldas OVNI";
  if (r >= 5)  return "🧉 Cebador del mate del Área 51";
  if (r >= 2)  return "🧹 Fajinador de retretes espaciales";
  return "🔭 Observador inicial";
}

/* =========================
   IA & GEOLOCALIZACIÓN
========================= */
async function consultarIA(text) {
  try {
    const prompt = `Actúa como AIFUCITO, la IA de la Red AIFU. Eres audaz, experto en ufología y tecnología futurista. Responde: ${text}`;
    const r = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`, 
      { contents: [{ parts: [{ text: prompt }] }] }, { timeout: 10000 });
    return r.data?.candidates?.[0]?.content?.parts?.[0]?.text || "Módulo de voz offline.";
  } catch { return "Error en enlace neuronal Gemini."; }
}

async function reverseGeo(lat, lng) {
  try {
    const r = await axios.get("https://nominatim.openstreetmap.org/reverse", {
      params: { format: "json", lat, lon: lng },
      headers: { "User-Agent": "AIFUCITO_V5" }, timeout: 5000
    });
    const a = r.data?.address || {};
    return { 
      pais: a.country_code?.toUpperCase() || "GLOBAL", 
      ciudad: a.city || a.town || a.village || "Desconocido" 
    };
  } catch { return { pais: "GLOBAL", ciudad: "N/A" }; }
}

/* =========================
   ALERTAS A CANALES
========================= */
async function enviarAlerta(pais, msg) {
  const channels = [process.env.CHANNEL_CONO_SUR];
  if (pais === "UY") channels.push(process.env.CHANNEL_UY);
  else if (pais === "AR") channels.push(process.env.CHANNEL_AR);
  else if (pais === "CL") channels.push(process.env.CHANNEL_CL);
  else channels.push(process.env.CHANNEL_GLOBAL);

  for (const c of channels) {
    if (c) await bot.telegram.sendMessage(c, `🚨 **ALERTA AIFU**\n${msg}`, { parse_mode: "Markdown" }).catch(() => {});
  }
}

/* =========================
   COMANDOS PRINCIPALES
========================= */

bot.start(async (ctx) => {
  const id = String(ctx.from.id);
  // Asegurar usuario en DB
  await supabase.from("usuarios").upsert({ 
    id, 
    nombre: ctx.from.first_name, 
    rol: id === ADMIN_ID ? "admin" : "user" 
  });
  ctx.session.state = STATE.IDLE;
  ctx.reply("🛸 **SISTEMA AIFU ONLINE**\nBienvenido al centro de mando. Esperando órdenes.", menu());
});

bot.hears("👤 Perfil", async (ctx) => {
  const { data } = await supabase.from("usuarios").select("*").eq("id", String(ctx.from.id)).maybeSingle();
  const nivel = obtenerRango(data?.reportes || 0, ctx.from.id);
  ctx.reply(`📊 **EXPEDIENTE AIFU**\n\n👤 **Agente:** ${data?.nombre}\n📑 **Reportes:** ${data?.reportes || 0}\n🎖️ **Rango:** ${nivel}`, { parse_mode: "Markdown" });
});

bot.hears("🗺 Mapa", (ctx) => {
  ctx.reply("🌐 Accediendo al Radar Táctico...", {
    reply_markup: { inline_keyboard: [[{ text: "🛰️ Ver Mapa en Vivo", url: "https://aifucito5-0.onrender.com" }]] }
  });
});

bot.hears("📍 Reportar", (ctx) => {
  ctx.session.state = STATE.WAIT_GPS;
  ctx.reply("📡 **Protocolo de Reporte**: Envía tu ubicación GPS para iniciar la triangulación.", 
    Markup.keyboard([[{ text: "📡 Enviar Posición GPS", request_location: true }], ["❌ Cancelar"]]).resize().oneTime());
});

bot.on("location", (ctx) => {
  if (ctx.session.state !== STATE.WAIT_GPS) return;
  ctx.session.lat = ctx.message.location.latitude;
  ctx.session.lng = ctx.message.location.longitude;
  ctx.session.state = STATE.WAIT_DESC;
  ctx.reply("📥 Coordenadas recibidas. Describe el evento (mínimo 20 caracteres):", Markup.removeKeyboard());
});

bot.on("text", async (ctx) => {
  const text = ctx.message.text;
  if (text === "❌ Cancelar") { 
    ctx.session.state = STATE.IDLE; 
    return ctx.reply("Operación abortada.", menu()); 
  }

  // FLUJO DE IA
  if (ctx.session.state === STATE.IA) {
    const ahora = Date.now();
    if (ahora - (ctx.session.last_ia || 0) < 15000) return ctx.reply("⏳ Enlace saturado. Espera unos segundos.");
    
    ctx.session.last_ia = ahora;
    const respuesta = await consultarIA(text);
    ctx.reply(`🤖 **AIFUCITO:** ${respuesta}`, { parse_mode: "Markdown" });
    ctx.session.state = STATE.IDLE;
    return;
  }

  // FLUJO DE DESCRIPCIÓN
  if (ctx.session.state === STATE.WAIT_DESC) {
    if (text.length < 20) return ctx.reply("⚠️ Información insuficiente (mín. 20 carac.).");
    
    const geo = await reverseGeo(ctx.session.lat, ctx.session.lng);
    ctx.session.pending = { 
      lat: ctx.session.lat, 
      lng: ctx.session.lng, 
      desc: text, 
      pais: geo.pais, 
      ciudad: geo.ciudad,
      user_id: String(ctx.from.id)
    };
    ctx.session.state = STATE.CONFIRM;

    return ctx.reply(`📝 **VERIFICACIÓN DE REPORTE**\n\n📍 **Lugar:** ${geo.ciudad}, ${geo.pais}\n💬 **Relato:** ${text}\n\n¿Confirmas la transmisión a la Red AIFU?`, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [
        [{ text: "✔ Confirmar Transmisión", callback_data: `ok:${ctx.from.id}` }],
        [{ text: "✖ Abortar", callback_data: `no:${ctx.from.id}` }]
      ]}
    });
  }
});

/* =========================
   ACCIONES (CALLBACKS BLINDADOS)
========================= */

bot.action(/^ok:(\d+)$/, async (ctx) => {
  const ownerId = ctx.match[1];
  if (String(ctx.from.id) !== ownerId) return ctx.answerCbQuery("⚠️ No autorizado.");
  if (ctx.session.is_processing) return ctx.answerCbQuery("Procesando...");
  
  const r = ctx.session.pending;
  if (!r) return ctx.answerCbQuery("Datos perdidos.");

  ctx.session.is_processing = true; 
  await ctx.answerCbQuery("Transmitiendo...");

  try {
    // 1. Guardar reporte
    await supabase.from("reportes").insert([{ 
      user_id: ownerId, lat: r.lat, lng: r.lng, descripcion: r.desc, pais: r.pais 
    }]);
    
    // 2. Actualizar contador y rango
    const { data: u } = await supabase.from("usuarios").select("reportes").eq("id", ownerId).single();
    const total = (u?.reportes || 0) + 1;
    await supabase.from("usuarios").update({ reportes: total }).eq("id", ownerId);

    // 3. Alerta a canales regionales
    await enviarAlerta(r.pais, `📍 *${r.ciudad}, ${r.pais}*\nUn ${obtenerRango(total, ownerId)} ha reportado actividad.`);

    ctx.reply(`✅ **REPORTE INDEXADO**\nTu nuevo rango: ${obtenerRango(total, ownerId)}`, menu());
  } catch (e) { 
    ctx.reply("❌ Error en el enlace con la base de datos."); 
  }

  ctx.session.pending = null;
  ctx.session.state = STATE.IDLE;
  ctx.session.is_processing = false; 
});

bot.action(/^no:(\d+)$/, async (ctx) => {
  if (String(ctx.from.id) !== ctx.match[1]) return ctx.answerCbQuery("⚠️ No permitido.");
  ctx.session.pending = null;
  ctx.session.state = STATE.IDLE;
  await ctx.answerCbQuery("Reporte cancelado");
  ctx.reply("Transmisión abortada.", menu());
});

bot.hears("🤖 Aifucito", (ctx) => {
  ctx.session.state = STATE.IA;
  ctx.reply("🤖 **AIFUCITO V5.0**\nEstableciendo enlace neuronal... ¿En qué puedo ayudarte?");
});

/* =========================
   LANZAMIENTO
========================= */
bot.launch();
console.log("🚀 RED AIFU V5.0: SISTEMA OPERATIVO COMPLETO");
