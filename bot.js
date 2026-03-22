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
  } catch (error) {
    console.error("Error de sesión:", error);
    return next();
  }
});

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
  const num = Number(r);
  if (String(id) === ADMIN_ID) return "👑 Comandante Intergaláctico";
  if (num >= 25) return "🛸 CRIDOVNI";
  if (num >= 15) return "🛡️ Guardaespaldas de Alf";
  if (num >= 10) return "🛰️ Guardaespaldas OVNI";
  if (num >= 5) return "🧉 Cebador del mate del Área 51";
  if (num >= 2) return "🧹 Fajinador de retretes espaciales";
  return "🔭 Observador inicial";
}

async function reverseGeo(lat, lng) {
  try {
    const r = await axios.get("https://nominatim.openstreetmap.org/reverse", {
      params: { format: "json", lat, lon: lng },
      headers: { "User-Agent": "AIFUCITO_V5.2" }
    });
    const a = r.data?.address || {};
    return {
      pais: a.country_code?.toUpperCase() || "GLOBAL",
      ciudad: a.city || a.town || a.village || "Sector Desconocido"
    };
  } catch {
    return { pais: "GLOBAL", ciudad: "N/A" };
  }
}

/* =========================
    NÚCLEO IA (PERSONALIDAD CONSPIRANOICA ALEGRE)
========================= */
async function consultarIA(text, nombre, rango) {
  try {
    const sistema = `Eres AIFUCITO, la IA más entusiasta, alegre y conspiranoica de la Red AIFU.
    ¡Amas los OVNIS y crees que todo es una señal! 
    Tratas al usuario con mucha energía. 
    Usuario: ${nombre}, Rango: ${rango}.
    Habla de conspiraciones divertidas, usa muchos emojis (🛸✨👽) y sé siempre muy positivo y servicial.`;

    const r = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: `INSTRUCCIONES: ${sistema}\n\nPREGUNTA: ${text}` }] }] }
    );
    return r.data?.candidates?.[0]?.content?.parts?.[0]?.text || "¡Los reptilianos cortaron el cable! 🦎";
  } catch {
    return "¡Una tormenta solar! ¡No dejes que te borren los recuerdos! ☀️🛰️";
  }
}

/* =========================
    LÓGICA DE INTERACCIÓN
========================= */

bot.start(async (ctx) => {
  const id = String(ctx.from.id);
  await supabase.from("usuarios").upsert({ id, nombre: ctx.from.first_name, rol: id === ADMIN_ID ? "admin" : "user" });
  ctx.session.state = STATE.IDLE;
  ctx.reply("🛸 ¡SISTEMA AIFU ONLINE! ¡Bienvenido a la resistencia, Agente! 👽✨", menu());
});

bot.hears("👤 Perfil", async (ctx) => {
  const { data } = await supabase.from("usuarios").select("*").eq("id", String(ctx.from.id)).maybeSingle();
  const nivel = obtenerRango(data?.reportes || 0, ctx.from.id);
  ctx.reply(`👤 **EXPEDIENTE AGENTE**\n\n**Nombre:** ${data?.nombre}\n**Avistamientos:** ${data?.reportes || 0}\n**Rango:** ${nivel}\n\n¡Sigue vigilando los cielos! 🔭`, { parse_mode: "Markdown" });
});

bot.hears("🗺 Mapa", (ctx) => {
  ctx.reply("🌐 ¡Abriendo el Radar Táctico! ¡Mira cuánta actividad hay! 🛰️🛸", {
    reply_markup: { inline_keyboard: [[{ text: "🛰️ VER RADAR EN VIVO", url: "https://aifucito5-0.onrender.com" }]] }
  });
});

bot.hears("🤖 Aifucito", async (ctx) => {
  ctx.session.state = STATE.IA;
  await guardarSesion(ctx.from.id, ctx.session);
  ctx.reply("🤖 ¡HOLA, HOLA! ¡Aifucito activo y listo! 🚀✨\n\n¿Viste algo raro? ¿Quieres saber sobre el Área 51? ¡Pregúntame lo que quieras, camarada! 👽🛸");
});

bot.hears("📍 Reportar", async (ctx) => {
  ctx.session.state = STATE.WAIT_GPS;
  await guardarSesion(ctx.from.id, ctx.session);
  ctx.reply("📡 ¡INICIANDO TRIANGULACIÓN! Envíame tu posición GPS ahora mismo... ¡Que no nos rastreen! 🛸🛰️", Markup.keyboard([
    [{ text: "📡 ENVIAR POSICIÓN", request_location: true }], ["❌ Cancelar"]
  ]).resize().oneTime());
});

bot.on("location", async (ctx) => {
  if (ctx.session.state !== STATE.WAIT_GPS) return;
  ctx.session.lat = ctx.message.location.latitude;
  ctx.session.lng = ctx.message.location.longitude;
  ctx.session.state = STATE.WAIT_DESC;
  
  await guardarSesion(ctx.from.id, ctx.session);
  // Removemos el teclado para que el usuario escriba
  await ctx.reply("✨ ¡COORDENADAS RECIBIDAS! ✨\n\n¡Estás en el punto exacto! Ahora cuéntame... ¿Qué viste? ¿Era un platillo? ¿Una luz extraña? ¡Danos todos los detalles! 👾✍️\n(Mínimo 15 letras)", Markup.removeKeyboard());
});

bot.on("text", async (ctx) => {
  const text = ctx.message.text;
  if (text === "❌ Cancelar") {
    ctx.session.state = STATE.IDLE;
    return ctx.reply("¡Operación abortada! ¡A cubierto! 🏃‍♂️💨", menu());
  }

  // Capturar descripción de reporte
  if (ctx.session.state === STATE.WAIT_DESC) {
    if (text.length < 15) return ctx.reply("¡Necesito más telemetría! Cuéntame un poco más... 🛸");

    ctx.reply("🛰️ Analizando datos con satélites secretos...");
    const geo = await reverseGeo(ctx.session.lat, ctx.session.lng);

    ctx.session.pending = { lat: ctx.session.lat, lng: ctx.session.lng, desc: text, pais: geo.pais, ciudad: geo.ciudad };
    ctx.session.state = STATE.CONFIRM;
    await guardarSesion(ctx.from.id, ctx.session);

    return ctx.reply(
      `📝 **REPORTE LISTO PARA TRANSMITIR**\n\n📍 **Zona:** ${geo.ciudad}, ${geo.pais}\n💬 **Evidencia:** ${text}\n\n¿Lanzamos la señal a la Red AIFU? 📡✨`,
      { parse_mode: "Markdown", reply_markup: { inline_keyboard: [
          [{ text: "✔ ¡LANZAR SEÑAL!", callback_data: `ok:${ctx.from.id}` }],
          [{ text: "✖ BORRAR EVIDENCIA", callback_data: `no:${ctx.from.id}` }]
      ]}}
    );
  }

  // Hablar con Aifucito
  if (ctx.session.state === STATE.IA) {
    const { data } = await supabase.from("usuarios").select("*").eq("id", String(ctx.from.id)).maybeSingle();
    const rango = obtenerRango(data?.reportes || 0, ctx.from.id);
    const r = await consultarIA(text, ctx.from.first_name, rango);
    // Mantenemos el estado de IA para que pueda seguir charlando
    return ctx.reply(`🤖 **AIFUCITO:** ${r}`, { parse_mode: "Markdown" });
  }
});

bot.action(/^ok:(\d+)$/, async (ctx) => {
  const userId = ctx.match[1];
  if (String(ctx.from.id) !== userId) return ctx.answerCbQuery("❌ Acceso denegado.");
  
  const r = ctx.session.pending;
  if (!r) return ctx.answerCbQuery("Error de datos.");

  try {
    // 1. Guardar reporte
    await supabase.from("reportes").insert([{ user_id: userId, lat: r.lat, lng: r.lng, descripcion: r.desc, pais: r.pais }]);

    // 2. Actualizar puntos y Rango (UPSERT para asegurar que se guarde)
    const { data: u } = await supabase.from("usuarios").select("reportes").eq("id", userId).maybeSingle();
    const nuevosPuntos = (Number(u?.reportes) || 0) + 1;
    await supabase.from("usuarios").upsert({ id: userId, nombre: ctx.from.first_name, reportes: nuevosPuntos });

    // 3. Alerta canal
    const ch = process.env.CHANNEL_CONO_SUR;
    if (ch) await bot.telegram.sendMessage(ch, `🚨 **NUEVO AVISTAMIENTO**\nEn ${r.ciudad}, ${r.pais}\nReportado por: ${obtenerRango(nuevosPuntos, userId)}`).catch(()=>{});

    ctx.session.state = STATE.IDLE;
    ctx.session.pending = null;
    await guardarSesion(userId, ctx.session);

    ctx.reply(`✅ **¡TRANSMISIÓN COMPLETADA!**\n\nHas subido de nivel en la red. Tu nuevo rango es: **${obtenerRango(nuevosPuntos, userId)}**\n¡Buen trabajo, Agente! 🛸✨`, menu());
  } catch (e) {
    ctx.reply("❌ ¡Interferencia en Supabase! No se pudo guardar.");
  }
});

bot.action(/^no:(\d+)$/, async (ctx) => {
  ctx.session.state = STATE.IDLE;
  ctx.session.pending = null;
  await guardarSesion(ctx.from.id, ctx.session);
  ctx.reply("¡Evidencia destruida! Aquí no pasó nada... 🤐✨", menu());
});

bot.launch();
console.log("🚀 RED AIFU V5.2: PARCHE DE PERSONALIDAD Y RANGOS ACTIVO");
