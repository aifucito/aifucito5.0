import "dotenv/config";
import { Telegraf, Markup, session } from "telegraf";
import express from "express";
import axios from "axios";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import cors from "cors";

// ===============================
// 🔐 CONFIGURACIÓN INICIAL
// ===============================
const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const GEMINI_KEY = process.env.VARIANT; // Tu API Key desde variables
const ADMIN_ID = 7662736311;

// ===============================
// 🧠 IA ENGINE (TU IMPLEMENTACIÓN)
// ===============================
async function askAI(text) {
  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        contents: [{ parts: [{ text: `Eres Aifucito, IA de AIFU. Responde de forma técnica y profesional. Usuario: Comandante. Consulta: ${text}` }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 400 }
      },
      { headers: { "Content-Type": "application/json" } }
    );
    return res.data.candidates?.[0]?.content?.parts?.[0]?.text || "Interferencia en la señal.";
  } catch (err) {
    console.error("Error IA:", err.response?.data || err.message);
    return "Error de comunicación con el núcleo de IA.";
  }
}

// ===============================
// 🎮 GAMIFICACIÓN AVANZADA
// ===============================
function getLevel(xp) {
  if (xp < 100) return "Recluta";
  if (xp < 300) return "Agente de Campo";
  if (xp < 700) return "Investigador";
  if (xp < 1500) return "Analista AIFU";
  return "Comandante AIFU";
}

async function updateProfile(userId, xpGain = 0) {
  const { data } = await supabase.from("profiles").select("*").eq("user_id", userId).single();
  let xp = (data?.xp || 0) + xpGain;
  const level = getLevel(xp);
  
  await supabase.from("profiles").upsert({
    user_id: userId,
    xp,
    level,
    updated_at: new Date()
  });
  return { xp, level };
}

// ===============================
// 🤖 MIDDLEWARES Y SESIÓN
// ===============================
bot.use(session());
app.use(express.json());
app.use(cors());
app.use(express.static("public"));

// ===============================
// 🚀 COMANDOS PRINCIPALES
// ===============================
const keyboardPrincipal = Markup.keyboard([
  ["📡 Reportar Avistamiento", "🛰 Ver Radar"],
  ["🧠 IA Aifucito", "👤 Perfil"],
  ["🎥 Documental", "💎 Premium"]
]).resize();

bot.start((ctx) => {
  ctx.session = {}; // Limpiar sesión
  return ctx.reply("🛸 AIFU SYSTEM ONLINE\nTerminal de comando lista.", keyboardPrincipal);
});

// --- 👤 PERFIL ---
bot.hears("👤 Perfil", async (ctx) => {
  const { xp, level } = await updateProfile(ctx.from.id, 0);
  return ctx.reply(`👤 **EXPEDIENTE AGENTE**\n\nNivel: ${level}\nXP: ${xp}\nID: ${ctx.from.id}`);
});

// --- 💎 PREMIUM & PAGOS ---
bot.hears("💎 Premium", (ctx) => {
  ctx.reply("💎 **UPGRADE DE CUENTA**\nAcceso ilimitado y funciones de análisis avanzado.",
    Markup.inlineKeyboard([
      [Markup.button.url("💳 Mercado Pago", "https://mercadopago.com.uy")],
      [Markup.button.url("🅿️ PayPal", "https://paypal.com")]
    ]));
});

// --- 🎥 DOCUMENTAL ---
bot.hears("🎥 Documental", (ctx) => {
  ctx.reply("🎥 **ARCHIVO HISTÓRICO AIFU**\nDocumentación y misión del proyecto.",
    Markup.inlineKeyboard([[Markup.button.url("📺 Ver Documental", "https://youtube.com/aifu")]]));
});

// --- 🛰 RADAR ---
bot.hears("🛰 Ver Radar", (ctx) => {
  const url = `${process.env.PUBLIC_URL || 'https://aifucito5-0.onrender.com'}/index.html?user_id=${ctx.from.id}`;
  return ctx.reply("🌍 Radar de avistamientos en vivo:", Markup.inlineKeyboard([[Markup.button.url("🗺 Abrir Mapa", url)]]));
});

// ===============================
// 📩 FLUJOS CONTROLADOS
// ===============================

// 1. Reporte
bot.hears("📡 Reportar Avistamiento", (ctx) => {
  ctx.session.step = "text";
  ctx.session.ai = false;
  return ctx.reply("📝 Paso 1: Describe lo observado (forma, luces, comportamiento):", Markup.removeKeyboard());
});

// 2. IA
bot.hears("🧠 IA Aifucito", (ctx) => {
  ctx.session.ai = true;
  ctx.session.step = null;
  return ctx.reply("🧠 Interfaz de IA conectada. Realice su consulta técnica:", Markup.keyboard([["⬅️ Volver"]]).resize());
});

bot.hears("⬅️ Volver", (ctx) => {
  ctx.session = {};
  return ctx.reply("Regresando a base.", keyboardPrincipal);
});

// ===============================
// 📩 MANEJADOR DE MENSAJES
// ===============================
bot.on("text", async (ctx) => {
  const session = ctx.session || {};

  if (session.ai) {
    await ctx.sendChatAction("typing");
    const res = await askAI(ctx.message.text);
    return ctx.reply(`🛸 **Aifucito:** ${res}`);
  }

  if (session.step === "text") {
    ctx.session.desc = ctx.message.text;
    ctx.session.step = "location";
    return ctx.reply("📍 Paso 2: Envíame la ubicación GPS donde ocurrió el fenómeno:", 
      Markup.keyboard([[Markup.button.locationRequest("📍 COMPARTIR GPS")]]).oneTime().resize());
  }
});

bot.on("location", async (ctx) => {
  if (ctx.session?.step !== "location") return;

  const { latitude, longitude } = ctx.message.location;

  try {
    await supabase.from("reports").insert({
      id: uuidv4(),
      user_id: ctx.from.id,
      descripcion: ctx.session.desc,
      lat: latitude,
      lng: longitude,
      created_at: new Date().toISOString()
    });

    const { xp, level } = await updateProfile(ctx.from.id, 50); // +50 XP por reporte
    ctx.session = {};
    return ctx.reply(`✅ **REPORTE REGISTRADO**\n\nHas ganado 50 XP.\nNuevo Total: ${xp} (${level})`, keyboardPrincipal);
  } catch (err) {
    return ctx.reply("⚠️ Error al sincronizar con el radar.");
  }
});

// ===============================
// 🌐 SERVIDOR Y ARRANQUE
// ===============================
app.get("/api/reportes", async (req, res) => {
  const { data } = await supabase.from("reports").select("*").order("created_at", { ascending: false }).limit(100);
  res.json(data || []);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🌐 SERVER ON", PORT));

bot.launch().then(() => console.log("🛸 BOT OPERATIVO"));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
