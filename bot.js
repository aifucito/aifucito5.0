import "dotenv/config";
import { Telegraf, session, Markup } from "telegraf";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { v4 as uuidv4 } from "uuid";
import express from "express";
import axios from "axios";

// 🆔 CONFIGURACIÓN DE MANDO
const OWNER_ID = "7662736311"; // Tu ID de Administrador

const app = express();
const PORT = process.env.PORT || 10000;
app.get("/", (req, res) => res.send("🛰️ NODO AIFU V9.8 - ONLINE"));
app.listen(PORT, () => console.log(`🚀 Puerto ${PORT} activo.`));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const aiModel = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const bot = new Telegraf(process.env.BOT_TOKEN);

const RANKS = [
  { xp: 0, name: "🚽 Fajinador de Retretes Espaciales" },
  { xp: 50, name: "🔭 Observador de Satélites Starlink" },
  { xp: 150, name: "💂 Guardaespalda de Alf" },
  { xp: 400, name: "🏡 Vigilante del Patio de Criridovni" },
  { xp: 800, name: "🕶️ Te Siguen los Hombres de Negro" },
  { xp: 2000, name: "🛸 Comandante Intergaláctico" }
];

bot.use(session());

// =====================================================
// 🎯 MENÚ PRINCIPAL RECALIBRADO
// =====================================================
const mainKeyboard = (isOwner) => {
  return Markup.keyboard([
    ["📍 Iniciar Reporte", "🛰️ Ver Radar (Mapa)"],
    ["👤 Mi Perfil", "🤝 Hazte Colaborador"],
    ["🤖 Hablar con Aifucito"]
  ]).resize();
};

bot.start((ctx) => {
  const isOwner = String(ctx.from.id) === OWNER_ID;
  ctx.session = { state: "IDLE", xp: isOwner ? 5000 : (ctx.session?.xp || 0) };
  
  return ctx.reply(`🌌 **Bienvenido al Nodo AIFU V9.8**\nSistemas listos para el rastreo, Comandante.`, 
    { parse_mode: "Markdown", ...mainKeyboard(isOwner) });
});

// =====================================================
// 🛰️ SECCIÓN MAPA / RADAR
// =====================================================
bot.hears("🛰️ Ver Radar (Mapa)", (ctx) => {
  ctx.reply("🌍 **Radar Global AIFU:**\nAquí puedes ver todos los reportes en tiempo real y el mapa de calor.", 
    Markup.inlineKeyboard([
      [Markup.button.url("🗺️ Abrir Mapa Interactivo", "https://aifucito5-0.onrender.com")]
    ]));
});

// =====================================================
// 🤝 SECCIÓN COLABORADOR (SISTEMA DE APOYO)
// =====================================================
bot.hears("🤝 Hazte Colaborador", (ctx) => {
  ctx.reply("✨ **¡Apoya la Investigación!**\nTu colaboración ayuda a mantener los servidores y el radar activos 24/7.\n\nElige tu método preferido:", 
    Markup.inlineKeyboard([
      [Markup.button.url("💳 Prex / Uruguay", "https://www.prexcard.com")],
      [Markup.button.url("🟦 Mercado Pago", "https://www.mercadopago.com.uy")],
      [Markup.button.url("🌎 PayPal (Internacional)", "https://www.paypal.com")]
    ]));
});

// =====================================================
// 👤 PERFIL Y RANGOS
// =====================================================
bot.hears("👤 Mi Perfil", (ctx) => {
  const isOwner = String(ctx.from.id) === OWNER_ID;
  const xp = isOwner ? 5000 : (ctx.session?.xp || 0);
  const rank = isOwner ? RANKS[5].name : ([...RANKS].reverse().find(r => xp >= r.xp)?.name || RANKS[0].name);
  
  ctx.reply(`🎖️ *FICHA DE AGENTE AIFU*\n\n👤 *Nombre:* ${ctx.from.first_name}\n📊 *Puntos de Investigación:* ${xp}\n🏆 *Rango Actual:* ${rank}`, { parse_mode: "Markdown" });
});

// =====================================================
// 🤖 IA AIFUCITO (MODO URUGUAYO AMABLE)
// =====================================================
bot.hears("🤖 Hablar con Aifucito", (ctx) => {
  ctx.session.state = "IA_CHAT";
  ctx.reply("🛸 **Aifucito:** ¡Hola! Qué alegría saludarte. Aquí estoy, tomando unos mates y mirando el radar. ¿En qué te puedo ayudar tú hoy, bo?", { parse_mode: "Markdown" });
});

bot.on("text", async (ctx) => {
  const text = ctx.message.text;

  if (ctx.session?.state === "IA_CHAT" && text !== "📍 Iniciar Reporte") {
    try {
      await ctx.sendChatAction("typing");
      const prompt = `Eres Aifucito, experto uruguayo en OVNIs. Muy amable, sociable y humilde. TUTEA siempre (di Tú, Te cuento). NO hables como porteño (nada de chamuyo, bardo, ni laburo). Habla como un vecino de Uruguay tomando mate. Pregunta: ${text}`;
      const result = await aiModel.generateContent(prompt);
      const response = await result.response;
      return ctx.reply(`🛸 **Aifucito:** ${response.text()}`, { parse_mode: "Markdown" });
    } catch (e) {
      return ctx.reply("⚠️ Se me cortó la señal, che. ¿Me repites?");
    }
  }

  // Lógica de Reporte (Simplificada para la prueba)
  if (ctx.session?.state === "WAITING_DESC") {
    ctx.session.state = "IDLE";
    ctx.reply("✅ **Reporte Guardado.** ¡Buen trabajo, Agente!", mainKeyboard(String(ctx.from.id) === OWNER_ID));
  }
});

// Protocolo GPS (Igual al anterior, asegurando el User-Agent)
bot.hears("📍 Iniciar Reporte", (ctx) => {
  ctx.session.state = "WAITING_LOCATION";
  ctx.reply("🛰️ **Protocolo de Ubicación:** Enviá tu posición para el radar.", 
    Markup.keyboard([[Markup.button.locationRequest("📍 Compartir mi Ubicación")]]).oneTime().resize());
});

bot.on("location", async (ctx) => {
  if (ctx.session.state !== "WAITING_LOCATION") return;
  const { latitude: lat, longitude: lng } = ctx.message.location;
  ctx.session = { ...ctx.session, lat, lng, state: "WAITING_DESC" };
  ctx.reply("📍 Ubicación recibida. Ahora describí brevemente qué viste:", Markup.removeKeyboard());
});

bot.launch();
