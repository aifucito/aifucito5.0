import "dotenv/config";
import { Telegraf, Markup } from "telegraf";
import axios from "axios";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import path from "path";

/* =========================
    CONFIGURACIÓN DE NÚCLEO
========================= */
const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const ADMIN_ID = String(process.env.ADMIN_ID);

const app = express();

const STATE = {
  IDLE: "idle",
  WAIT_GPS: "wait_gps",
  WAIT_DESC: "wait_desc",
  IA: "ia",
  CONFIRM: "confirm"
};

const CHANNELS = {
  "UY": process.env.CHANNEL_UY,
  "AR": process.env.CHANNEL_AR,
  "CL": process.env.CHANNEL_CL
};

/* =========================
    SERVIDOR WEB (RADAR)
========================= */
app.use(express.static(path.join(process.cwd(), "public")));
app.get("/api/reports", async (req, res) => {
  try {
    const { data } = await supabase.from("reportes").select("*").order('created_at', { ascending: false });
    res.json(data || []);
  } catch (e) { res.json([]); }
});
app.get("/", (req, res) => res.sendFile(path.join(process.cwd(), "public", "index.html")));
app.listen(process.env.PORT || 3000, "0.0.0.0");

/* =========================
    SESIÓN PERSISTENTE
========================= */
bot.use(async (ctx, next) => {
  if (!ctx.from) return next();
  const id = String(ctx.from.id);
  try {
    const { data } = await supabase.from("sesiones").select("data").eq("id", id).maybeSingle();
    ctx.session = data?.data || { state: STATE.IDLE };
    await next();
    await supabase.from("sesiones").upsert({ id, data: ctx.session, updated_at: new Date() });
  } catch (error) { return next(); }
});

async function guardarSesion(id, sessionData) {
  await supabase.from("sesiones").upsert({ id: String(id), data: sessionData, updated_at: new Date() });
}

/* =========================
    UTILIDADES & RANGOS
========================= */
function menu() {
  return Markup.keyboard([["📍 Reportar"], ["🗺 Mapa"], ["🤖 Aifucito", "👤 Perfil"]]).resize();
}

function obtenerRango(r = 0, id = "") {
  const num = Number(r);
  if (String(id) === ADMIN_ID) return "👑 Comandante Intergaláctico";
  if (num >= 25) return "🛸 CRIDOVNI";
  if (num >= 15) return "🛡️ Guardaespaldas de Alf";
  if (num >= 5) return "🧉 Cebador del mate del Área 51";
  if (num >= 2) return "🧹 Fajinador de retretes espaciales";
  return "🔭 Observador inicial";
}

async function reverseGeo(lat, lng) {
  try {
    const r = await axios.get("https://nominatim.openstreetmap.org/reverse", {
      params: { format: "json", lat, lon: lng },
      headers: { "User-Agent": "AIFUCITO_V5.9" }
    });
    const a = r.data?.address || {};
    return {
      pais_code: a.country_code?.toUpperCase() || "GLOBAL",
      ciudad: a.city || a.town || a.village || "Sector Desconocido"
    };
  } catch { return { pais_code: "GLOBAL", ciudad: "N/A" }; }
}

/* =========================
    NÚCLEO IA (PERSONALIDAD)
========================= */
async function consultarIA(text, nombre, rango) {
  try {
    const sistema = `Eres AIFUCITO, la IA más alegre, divertida y conspiranoica de la Red AIFU. ¡Amas los OVNIS! 
    Usuario: ${nombre}, Rango: ${rango}. Habla con mucha energía, usa emojis espaciales (🛸✨👽) y sé siempre positivo.`;
    
    const r = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`, 
    { contents: [{ parts: [{ text: `${sistema}\n\nPregunta: ${text}` }] }] });
    return r.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  } catch { return "¡Interferencia de los reptilianos! Intenta de nuevo. 🦎"; }
}

/* =========================
    FLUJO TÁCTICO
========================= */

bot.start(async (ctx) => {
  const id = String(ctx.from.id);
  await supabase.from("usuarios").upsert({ id, nombre: ctx.from.first_name, rol: id === ADMIN_ID ? "admin" : "user" });
  ctx.session.state = STATE.IDLE;
  ctx.reply("🛸 ¡SISTEMA AIFU ONLINE! ¡Bienvenido a la resistencia, Agente! 👽✨", menu());
});

bot.hears("📍 Reportar", async (ctx) => {
  ctx.session.state = STATE.WAIT_GPS;
  await guardarSesion(ctx.from.id, ctx.session);
  ctx.reply("📡 ¡INICIANDO TRIANGULACIÓN! Envía tu posición GPS para localizar la anomalía... 🌍", 
    Markup.keyboard([[{ text: "📡 ENVIAR MI POSICIÓN", request_location: true }], ["❌ Cancelar"]]).resize().oneTime());
});

bot.on("location", async (ctx) => {
  if (ctx.session.state !== STATE.WAIT_GPS) return;
  
  ctx.session.lat = ctx.message.location.latitude;
  ctx.session.lng = ctx.message.location.longitude;
  const geo = await reverseGeo(ctx.session.lat, ctx.session.lng);
  ctx.session.pais_code = geo.pais_code;
  ctx.session.ciudad = geo.ciudad;
  
  ctx.session.state = STATE.WAIT_DESC;
  await guardarSesion(ctx.from.id, ctx.session);

  let msg = `✨ ¡POSICIÓN CAPTURADA EN ${geo.ciudad}! ✨\n\nSector: **${geo.pais_code}**.`;
  const channelId = CHANNELS[geo.pais_code] || process.env.CHANNEL_GLOBAL;
  const buttons = [];

  if (channelId) {
    try {
      const link = await ctx.telegram.createChatInviteLink(channelId, { member_limit: 1 });
      buttons.push([{ text: `🛰️ Unirse a Red AIFU ${geo.pais_code}`, url: link.invite_link }]);
      msg += `\n\n¿Quieres unirte a la unidad táctica de este sector? 🛰️`;
    } catch (e) { console.log("Error de link"); }
  }

  await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } });
  setTimeout(() => {
    ctx.reply("👾 **SIGUIENTE PASO:** ¡Rápido! Describe lo que viste. ¿Fue un platillo? ¿Luces? ¡Cuéntalo todo! ✍️", Markup.removeKeyboard());
  }, 1200);
});

bot.on("text", async (ctx) => {
  const text = ctx.message.text;
  if (text === "❌ Cancelar") {
    ctx.session.state = STATE.IDLE;
    return ctx.reply("¡Operación cancelada! Volviendo a la base.", menu());
  }

  if (ctx.session.state === STATE.WAIT_DESC) {
    if (text.length < 10) return ctx.reply("¡Necesito un poco más de telemetría! (mín. 10 letras) 🛸");
    ctx.session.pending = { lat: ctx.session.lat, lng: ctx.session.lng, desc: text, pais: ctx.session.pais_code, ciudad: ctx.session.ciudad };
    ctx.session.state = STATE.CONFIRM;
    await guardarSesion(ctx.from.id, ctx.session);

    return ctx.reply(`📝 **VERIFICACIÓN**\n\n📍 **Lugar:** ${ctx.session.ciudad}\n💬 **Evidencia:** ${text}\n\n¿Transmitimos? 📡✨`,
      { parse_mode: "Markdown", reply_markup: { inline_keyboard: [
          [{ text: "✔ ¡SÍ, TRANSMITIR!", callback_data: `ok:${ctx.from.id}` }],
          [{ text: "❌ REHACER / ABORTAR", callback_data: `no:${ctx.from.id}` }]
      ]}});
  }

  if (ctx.session.state === STATE.IA) {
    const { data } = await supabase.from("usuarios").select("*").eq("id", String(ctx.from.id)).maybeSingle();
    const r = await consultarIA(text, ctx.from.first_name, obtenerRango(data?.reportes, ctx.from.id));
    return ctx.reply(`🤖 **AIFUCITO:** ${r}`, { parse_mode: "Markdown" });
  }
});

bot.action(/^ok:(\d+)$/, async (ctx) => {
  if (String(ctx.from.id) !== ctx.match[1]) return ctx.answerCbQuery("❌");
  const r = ctx.session.pending;
  try {
    await supabase.from("reportes").insert([{ user_id: ctx.match[1], lat: r.lat, lng: r.lng, descripcion: r.desc, pais: r.pais }]);
    const { data: u } = await supabase.from("usuarios").select("reportes").eq("id", ctx.match[1]).maybeSingle();
    const nuevosPuntos = (Number(u?.reportes) || 0) + 1;
    await supabase.from("usuarios").upsert({ id: ctx.match[1], nombre: ctx.from.first_name, reportes: nuevosPuntos });
    ctx.session.state = STATE.IDLE;
    await guardarSesion(ctx.from.id, ctx.session);
    ctx.reply(`✅ **REPORTE INDEXADO**\n\n¡Gracias por colaborar! Rango actual: **${obtenerRango(nuevosPuntos, ctx.from.id)}**`, menu());
  } catch (e) { ctx.reply("❌ Error en la Red AIFU."); }
});

bot.action(/^no:(\d+)$/, async (ctx) => {
  ctx.session.state = STATE.IDLE;
  await guardarSesion(ctx.from.id, ctx.session);
  ctx.reply("Memoria limpia. ¡A seguir vigilando! 🔭", menu());
});

bot.hears("🤖 Aifucito", (ctx) => {
  ctx.session.state = STATE.IA;
  ctx.reply("🤖 ¡HOLA! Aifucito activo. ¿Qué conspiración vamos a investigar hoy? 👽✨");
});

bot.hears("👤 Perfil", async (ctx) => {
  const { data } = await supabase.from("usuarios").select("*").eq("id", String(ctx.from.id)).maybeSingle();
  ctx.reply(`👤 **AGENTE:** ${data?.nombre}\n**RANGO:** ${obtenerRango(data?.reportes, ctx.from.id)}`, menu());
});

bot.hears("🗺 Mapa", (ctx) => {
  ctx.reply("🌐 ¡Abriendo el Radar Táctico! 🛰️🛸", {
    reply_markup: { inline_keyboard: [[{ text: "🛰️ VER RADAR", url: "https://aifucito5-0.onrender.com" }]] }
  });
});

bot.launch();
console.log("🚀 RED AIFU V5.9: SISTEMA TOTALMENTE OPERATIVO");
