import "dotenv/config";
import { Telegraf, Markup } from "telegraf";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";

// ==========================================
// 🔴 CONFIGURACIÓN Y RUTAS DE CANALES
// ==========================================
const OWNER_ID = "7662736311";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHANNELS = {
  UY: process.env.CHANNEL_UY,
  AR: process.env.CHANNEL_AR,
  CL: process.env.CHANNEL_CL,
  GLOBAL: process.env.CHANNEL_GLOBAL,
  CONOSUR: process.env.CHANNEL_CONOSUR 
};

const REQUIRED_ENV = ["BOT_TOKEN", "SUPABASE_URL", "SUPABASE_KEY", "GEMINI_API_KEY", "CHANNEL_CONOSUR"];
if (REQUIRED_ENV.some(k => !process.env[k])) throw new Error("Faltan variables críticas.");

// Clientes Core
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const bot = new Telegraf(process.env.BOT_TOKEN);
const aiModel = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({
  model: "gemini-1.5-flash",
  tools: [{ googleSearchRetrieval: {} }]
});

// 🎖️ TUS RANGOS PERSONALIZADOS
const RANKS = [
  { xp: 0, name: "Fajinador de Retretes espaciales" },
  { xp: 50, name: "Observador de Satélites starlink" },
  { xp: 150, name: "Guardaespalda de Alf" },
  { xp: 400, name: "Vigilante del Patio cridovni" },
  { xp: 800, name: "Agente de Campo nasa" },
  { xp: 2000, name: "Investigador RADAR AIFU" }
];

// ==========================================
// 🧠 MOTOR DE SESIÓN Y PERFILES
// ==========================================
const getProfile = async (userId) => {
  const { data, error } = await supabase.from("sessions").select("*").eq("user_id", userId).maybeSingle();
  if (error || !data) {
    const fresh = { user_id: userId, state: "IDLE", xp: 0, ai_count: 0, is_premium: false, updated_at: new Date() };
    await supabase.from("sessions").upsert(fresh);
    return fresh;
  }
  return data;
};

const updateSession = async (userId, updateData) => {
  await supabase.from("sessions").update({ ...updateData, updated_at: new Date() }).eq("user_id", userId);
};

// ==========================================
// 🚀 COMANDOS Y MENÚ PRINCIPAL
// ==========================================
bot.start(async (ctx) => {
  await getProfile(String(ctx.from.id));
  const menu = Markup.keyboard([
    ["📍 Iniciar Reporte", "🛰️ Ver Radar"],
    ["👤 Mi Perfil", "🤖 Hablar con Aifucito"],
    ["🤝 Hacerse Colaborador"]
  ]).resize();

  return ctx.reply("🌌 **RADAR AIFU ACTIVADO**\n\nBienvenido Agente. Sistema de monitoreo de fenómenos anómalos en tiempo real. ¿Qué misión tenemos tú hoy?", { parse_mode: "Markdown", ...menu });
});

bot.hears(["📍 Iniciar Reporte", "👤 Mi Perfil", "🛰️ Ver Radar", "🤝 Hacerse Colaborador"], async (ctx, next) => {
  await updateSession(String(ctx.from.id), { state: "IDLE" });
  return next();
});

// ==========================================
// 📍 SISTEMA DE REPORTES GEOGRÁFICOS
// ==========================================
bot.hears("📍 Iniciar Reporte", async (ctx) => {
  await updateSession(String(ctx.from.id), { state: "WAITING_LOCATION" });
  return ctx.reply("📡 **RADAR AIFU:** Compartí tu ubicación actual para geolocalizar el fenómeno.", 
    Markup.keyboard([[Markup.button.locationRequest("📍 Compartir Ubicación")]]).oneTime().resize());
});

bot.on("location", async (ctx) => {
  const userId = String(ctx.from.id);
  const session = await getProfile(userId);
  if (session.state !== "WAITING_LOCATION") return;

  const { latitude: lat, longitude: lng } = ctx.message.location;
  let pais = "GLOBAL"; 
  let ciudad = "Zona Rural";

  try {
    const geo = await axios.get(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, { timeout: 4000 });
    const code = geo.data?.address?.country_code?.toUpperCase();
    if (["UY", "AR", "CL"].includes(code)) pais = code;
    ciudad = geo.data?.address?.city || geo.data?.address?.town || geo.data?.address?.village || "Coordenadas GPS";
  } catch (e) { console.warn("Geo Fallback"); }

  await updateSession(userId, { state: "WAITING_DESC", lat, lng, ciudad, pais });
  ctx.reply(`📍 **Localizado en:** ${ciudad} (${pais}).\n\n¿Qué fue lo que viste tú? Describilo con tranquilidad.`, Markup.removeKeyboard());
});

// ==========================================
// 🤖 PROCESAMIENTO DE TEXTO (IA Y REPORTES)
// ==========================================
bot.on("text", async (ctx) => {
  const userId = String(ctx.from.id);
  const user = await getProfile(userId);
  const text = ctx.message.text;

  if (user.state === "WAITING_DESC") {
    const reportId = uuidv4();
    const { error } = await supabase.from("reportes").insert({
      id: reportId, user_id: userId, lat: user.lat, lng: user.lng, descripcion: text, ciudad: user.ciudad, pais: user.pais
    });

    if (error) return ctx.reply("⚠️ Error de conexión con la base de datos.");

    const alerta = `🚨 **NUEVO REPORTE EN RADAR**\n📍 ${user.ciudad} (${user.pais})\n👤 Agente: ${ctx.from.first_name}\n📝 ${text}\n🌍 [Abrir Mapa](https://aifucito5-0.onrender.com)`;

    const canalDestino = CHANNELS[user.pais] || CHANNELS.GLOBAL;
    bot.telegram.sendMessage(canalDestino, alerta).catch(() => {});
    bot.telegram.sendMessage(CHANNELS.CONOSUR, alerta).catch(() => {});

    await updateSession(userId, { state: "IDLE", xp: (user.xp || 0) + 25 });
    return ctx.reply("✅ **Sincronizado.** Tu reporte ya está en la red de RADAR AIFU.", 
      Markup.keyboard([["📍 Iniciar Reporte", "🛰️ Ver Radar"], ["👤 Mi Perfil", "🤖 Hablar con Aifucito"]]).resize());
  }

  if (user.state === "IA_CHAT" && !text.startsWith("/")) {
    if (!user.is_premium && (user.ai_count || 0) >= 3) {
      return ctx.reply("⚠️ **Límite alcanzado.**\nComo usuario gratuito tienes 3 consultas diarias. Hazte Colaborador para hablar sin límites.",
        Markup.inlineKeyboard([[Markup.button.url("🤝 Ser Colaborador", "https://tu-link.com")]]));
    }

    try {
      await ctx.sendChatAction("typing");
      const prompt = `Eres Aifucito de RADAR AIFU. Uruguayo, humilde y amable. Tuteas siempre ("tú"). Responde de forma clara y breve. Usuario: ${text}`;
      const res = await aiModel.generateContent(prompt);
      
      await supabase.from("sessions").update({ ai_count: (user.ai_count || 0) + 1 }).eq("user_id", userId);
      return ctx.reply(`🛸 **Aifucito:** ${res.response.text()}`);
    } catch (e) { return ctx.reply("⚠️ Interferencia en la señal de la IA."); }
  }
});

// ==========================================
// 🛠️ BOTONES DE NAVEGACIÓN
// ==========================================
bot.hears("🤖 Hablar con Aifucito", async (ctx) => {
  await updateSession(String(ctx.from.id), { state: "IA_CHAT" });
  ctx.reply("🛸 **Aifucito:** ¡Hola! Un gusto charlar contigo tú hoy. ¿Qué me quieres contar?");
});

bot.hears("🛰️ Ver Radar", (ctx) => {
  ctx.reply("🌍 **RADAR AIFU - Mapa en Vivo:**", Markup.inlineKeyboard([
    [Markup.button.url("🗺️ Abrir Mapa Interactivo", "https://aifucito5-0.onrender.com")]
  ]));
});

bot.hears("👤 Mi Perfil", async (ctx) => {
  const user = await getProfile(String(ctx.from.id));
  const rank = [...RANKS].reverse().find(r => user.xp >= r.xp)?.name || RANKS[0].name;
  ctx.reply(`🎖️ **FICHA DE AGENTE**\n👤 **Nombre:** ${ctx.from.first_name}\n📊 **XP:** ${user.xp}\n🏆 **Rango:** ${rank}\n💎 **Estado:** ${user.is_premium ? "Colaborador" : "Gratuito"}`);
});

bot.hears("🤝 Hacerse Colaborador", (ctx) => {
  ctx.reply("🤝 **Apoyá la investigación de RADAR AIFU:**\n\nCon tu colaboración desbloqueas el Radar Histórico completo e IA ilimitada.", 
    Markup.inlineKeyboard([[Markup.button.url("💳 Mercado Pago / Prex", "https://tu-link.com")]]));
});

// ==========================================
// 📢 MANDO COMANDANTE (BROADCAST SEGURO)
// ==========================================
bot.command("broadcast", async (ctx) => {
  if (String(ctx.from.id) !== OWNER_ID) return;
  const msg = ctx.message.text.replace("/broadcast ", "");
  if (!msg || msg === "/broadcast") return ctx.reply("Escribí un mensaje, tú.");

  const { data: users } = await supabase.from("sessions").select("user_id");
  ctx.reply(`🚀 Enviando a ${users.length} agentes...`);

  for (const u of users || []) {
    await new Promise(r => setTimeout(r, 300)); 
    bot.telegram.sendMessage(u.user_id, `📢 **AVISO RADAR AIFU:**\n\n${msg}`).catch(() => {});
  }
  ctx.reply("✅ Broadcast completado.");
});

bot.launch();

// ==========================================
// 🌐 SERVIDOR WEB PARA EL RADAR (EXPRESS)
// ==========================================
const app = express();
app.use(cors());
app.use(express.json());

// Hace pública la carpeta 'public' para el index.html
app.use(express.static(path.join(__dirname, "public")));

// API que alimenta el mapa neón
app.get("/api/reportes", async (req, res) => {
  const { range } = req.query;
  let query = supabase.from("reportes").select("*");

  if (range === "24h") {
    query = query.gt('created_at', new Date(Date.now() - 24*60*60*1000).toISOString());
  } else if (range === "7d") {
    query = query.gt('created_at', new Date(Date.now() - 7*24*60*60*1000).toISOString());
  }

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) return res.status(500).json(error);
  res.json(data);
});

// Servir el index.html en la raíz
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(process.env.PORT || 10000, () => {
  console.log("📡 RADAR AIFU OPERATIVO - Puerta 10000 abierta.");
});
