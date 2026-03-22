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

/* =========================
    SERVIDOR WEB (RADAR TÁCTICO)
========================= */
app.use(express.static(path.join(process.cwd(), "public")));

app.get("/api/reports", async (req, res) => {
  try {
    const { data } = await supabase.from("reportes").select("*").order('created_at', { ascending: false });
    res.json(data || []);
  } catch (e) {
    res.json([]);
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

app.listen(process.env.PORT || 3000, "0.0.0.0");

/* =========================
    SESIÓN PERSISTENTE (MEJORADA)
========================= */
bot.use(async (ctx, next) => {
  if (!ctx.from) return next();
  const id = String(ctx.from.id);

  try {
    const { data } = await supabase.from("sesiones").select("data").eq("id", id).maybeSingle();
    ctx.session = data?.data || { state: STATE.IDLE };
    
    await next();

    // Guardado de seguridad al final de cada interacción
    await supabase.from("sesiones").upsert({ id, data: ctx.session, updated_at: new Date() });
  } catch (error) {
    console.error("Error en enlace de sesión:", error);
    return next();
  }
});

// Función para forzar guardado manual en momentos críticos
async function guardarSesion(id, sessionData) {
  await supabase.from("sesiones").upsert({ id: String(id), data: sessionData, updated_at: new Date() });
}

/* =========================
    UTILIDADES & RANGOS
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
  if (r >= 5) return "🧉 Cebador del mate del Área 51";
  if (r >= 2) return "🧹 Fajinador de retretes espaciales";
  return "🔭 Observador inicial";
}

async function reverseGeo(lat, lng) {
  try {
    const r = await axios.get("https://nominatim.openstreetmap.org/reverse", {
      params: { format: "json", lat, lon: lng },
      headers: { "User-Agent": "AIFUCITO_V5" }
    });
    const a = r.data?.address || {};
    return {
      pais: a.country_code?.toUpperCase() || "GLOBAL",
      ciudad: a.city || a.town || a.village || "Zona No Identificada"
    };
  } catch {
    return { pais: "GLOBAL", ciudad: "N/A" };
  }
}

async function enviarAlerta(msg) {
  const channel = process.env.CHANNEL_CONO_SUR;
  if (channel) {
    await bot.telegram.sendMessage(channel, `🚨 **ALERTA AIFU**\n${msg}`, { parse_mode: "Markdown" }).catch(() => {});
  }
}

/* =========================
    LÓGICA DEL BOT
========================= */

bot.start(async (ctx) => {
  const id = String(ctx.from.id);
  await supabase.from("usuarios").upsert({ id, nombre: ctx.from.first_name, rol: id === ADMIN_ID ? "admin" : "user" });
  ctx.session.state = STATE.IDLE;
  ctx.reply("🛸 **SISTEMA AIFU ONLINE**\nBienvenido Agente.", menu());
});

bot.hears("👤 Perfil", async (ctx) => {
  const { data } = await supabase.from("usuarios").select("*").eq("id", String(ctx.from.id)).maybeSingle();
  const nivel = obtenerRango(data?.reportes || 0, ctx.from.id);
  ctx.reply(`👤 **Agente:** ${data?.nombre}\n📑 **Reportes:** ${data?.reportes || 0}\n🎖️ **Rango:** ${nivel}`, { parse_mode: "Markdown" });
});

bot.hears("🗺 Mapa", (ctx) => {
  ctx.reply("🌐 Accediendo al Radar Táctico...", {
    reply_markup: { inline_keyboard: [[{ text: "🛰️ Abrir Mapa en Vivo", url: "https://aifucito5-0.onrender.com" }]] }
  });
});

bot.hears("📍 Reportar", async (ctx) => {
  ctx.session.state = STATE.WAIT_GPS;
  await guardarSesion(ctx.from.id, ctx.session); // Forzamos guardado de estado
  ctx.reply("📡 Envía tu posición GPS para iniciar la triangulación.", Markup.keyboard([
    [{ text: "📡 Enviar Posición GPS", request_location: true }], ["❌ Cancelar"]
  ]).resize().oneTime());
});

bot.on("location", async (ctx) => {
  if (ctx.session.state !== STATE.WAIT_GPS) return;
  ctx.session.lat = ctx.message.location.latitude;
  ctx.session.lng = ctx.message.location.longitude;
  ctx.session.state = STATE.WAIT_DESC;
  
  await guardarSesion(ctx.from.id, ctx.session); // Guardado crítico para que el texto sea reconocido
  await ctx.reply("📥 Coordenadas fijadas. Escribe ahora la descripción del evento (mín. 15 carac.):", Markup.removeKeyboard());
});

bot.on("text", async (ctx) => {
  const text = ctx.message.text;
  if (text === "❌ Cancelar") {
    ctx.session.state = STATE.IDLE;
    return ctx.reply("Operación abortada.", menu());
  }

  // Capturador de descripción
  if (ctx.session.state === STATE.WAIT_DESC) {
    if (text.length < 15) return ctx.reply("⚠️ Telemetría insuficiente. Aporta más detalles.");

    ctx.reply("🛰️ Procesando datos geográficos...");
    const geo = await reverseGeo(ctx.session.lat, ctx.session.lng);

    ctx.session.pending = { lat: ctx.session.lat, lng: ctx.session.lng, desc: text, pais: geo.pais, ciudad: geo.ciudad };
    ctx.session.state = STATE.CONFIRM;
    await guardarSesion(ctx.from.id, ctx.session);

    return ctx.reply(
      `📝 **PRE-REPORTE**\n📍 **Lugar:** ${geo.ciudad}, ${geo.pais}\n💬 **Relato:** ${text}\n\n¿Confirmas la transmisión?`,
      { parse_mode: "Markdown", reply_markup: { inline_keyboard: [
          [{ text: "✔ Confirmar", callback_data: `ok:${ctx.from.id}` }],
          [{ text: "✖ Abortar", callback_data: `no:${ctx.from.id}` }]
      ]}}
    );
  }

  if (ctx.session.state === STATE.IA) {
    const r = await consultarIA(text);
    ctx.session.state = STATE.IDLE;
    return ctx.reply(`🤖 **AIFUCITO:** ${r}`, { parse_mode: "Markdown" });
  }
});

bot.action(/^ok:(\d+)$/, async (ctx) => {
  const userId = ctx.match[1];
  if (String(ctx.from.id) !== userId) return ctx.answerCbQuery("⚠️ No autorizado.");
  
  const r = ctx.session.pending;
  if (!r) return ctx.answerCbQuery("Error: Sesión expirada.");

  try {
    // 1. Insertar reporte
    await supabase.from("reportes").insert([{ user_id: userId, lat: r.lat, lng: r.lng, descripcion: r.desc, pais: r.pais }]);

    // 2. Incrementar reportes (Asegurando que el usuario existe)
    const { data: u } = await supabase.from("usuarios").select("reportes").eq("id", userId).maybeSingle();
    const nuevosReportes = (u?.reportes || 0) + 1;
    await supabase.from("usuarios").upsert({ id: userId, nombre: ctx.from.first_name, reportes: nuevosReportes });

    // 3. Alerta global
    await enviarAlerta(`📍 *${r.ciudad}, ${r.pais}*\nReportado por un ${obtenerRango(nuevosReportes, userId)}.`);

    ctx.session.state = STATE.IDLE;
    ctx.session.pending = null;
    await guardarSesion(userId, ctx.session);

    ctx.reply(`✅ **TRANSMISIÓN EXITOSA**\nTu rango: ${obtenerRango(nuevosReportes, userId)}`, menu());
  } catch (e) {
    console.error(e);
    ctx.reply("❌ Error en el servidor de Supabase.");
  }
});

bot.action(/^no:(\d+)$/, async (ctx) => {
  ctx.session.state = STATE.IDLE;
  ctx.session.pending = null;
  await guardarSesion(ctx.from.id, ctx.session);
  ctx.reply("Memoria temporal limpia.", menu());
});

bot.hears("🤖 Aifucito", (ctx) => {
  ctx.session.state = STATE.IA;
  ctx.reply("🤖 Estableciendo enlace neuronal... ¿Qué deseas consultar?");
});

bot.launch();
console.log("🚀 RED AIFU V5.1: PARCHE DE SESIÓN APLICADO");
