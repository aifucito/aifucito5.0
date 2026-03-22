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

/* ==========================================
   💎 1. CONFIGURACIÓN E INFRAESTRUCTURA
========================================== */
const ADMIN_IDS = ["7662736311"]; 
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Clientes Core: Supabase + Gemini IA
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const bot = new Telegraf(process.env.BOT_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const aiModel = genAI.getGenerativeModel({ 
  model: "gemini-1.5-flash",
  generationConfig: { temperature: 0.8, maxOutputTokens: 450 }
});

// Canales de Reporte (Cono Sur)
const CHANNELS = {
  UY: process.env.CHANNEL_UY,
  AR: process.env.CHANNEL_AR,
  CL: process.env.CHANNEL_CL,
  GLOBAL: process.env.CHANNEL_GLOBAL,
  CONOSUR: process.env.CHANNEL_CONOSUR 
};

// Sistema de Rangos AIFU
const RANKS = [
  { xp: 0, name: "Fajinador de Retretes espaciales" },
  { xp: 50, name: "Observador de Satélites starlink" },
  { xp: 150, name: "Guardaespalda de Alf" },
  { xp: 400, name: "Vigilante del Patio cridovni" },
  { xp: 800, name: "Agente de Campo nasa" },
  { xp: 2000, name: "Investigador RADAR AIFU" }
];

/* ==========================================
   🧠 2. GESTIÓN DE MEMORIA Y PERSISTENCIA
========================================== */
const memory = new Map();

// Función Crítica: Recupera o CREA usuario (Evita el error de Render)
const getProfile = async (id) => {
  if (memory.has(id)) return memory.get(id);
  try {
    let { data, error } = await supabase.from("sessions").select("*").eq("user_id", id).maybeSingle();
    if (!data || error) {
      data = { user_id: id, state: "IDLE", xp: 0, ai_count: 0, is_premium: false };
      await supabase.from("sessions").upsert(data);
    }
    memory.set(id, data);
    return data;
  } catch (e) {
    return { user_id: id, state: "IDLE", xp: 0, ai_count: 0 };
  }
};

const updateSession = async (id, payload) => {
  const current = await getProfile(id);
  const updated = { ...current, ...payload };
  memory.set(id, updated);
  return supabase.from("sessions").update(payload).eq("user_id", id);
};

const isAdmin = (id) => ADMIN_IDS.includes(String(id));

/* ==========================================
   🚀 3. INTERFAZ DEL BOT (TELEGRAM)
========================================== */
const mainBtn = Markup.keyboard([
  ["📍 Iniciar Reporte", "🛰️ Ver Radar"],
  ["👤 Mi Perfil", "🤖 Hablar con Aifucito"],
  ["🤝 Hacerse Colaborador", "⬅️ Menú"]
]).resize();

bot.start(async (ctx) => {
  await getProfile(String(ctx.from.id));
  ctx.reply("🌌 **RADAR AIFU V12.9**\nSistema de monitoreo intergaláctico activo.", mainBtn);
});

bot.hears("⬅️ Menú", async (ctx) => {
  await updateSession(String(ctx.from.id), { state: "IDLE" });
  ctx.reply("Base central en espera...", mainBtn);
});

bot.hears("👤 Mi Perfil", async (ctx) => {
  const user = await getProfile(String(ctx.from.id));
  const rank = [...RANKS].reverse().find(r => user.xp >= r.xp)?.name || RANKS[0].name;
  ctx.reply(`🎖️ **FICHA DE AGENTE**\n\n👤 ID: ${user.user_id}\n📊 XP: ${user.xp}\n🏆 Rango: ${rank}\n🤖 IA: ${user.ai_count}/3\n💎 Premium: ${user.is_premium ? "SÍ" : "NO"}`);
});

// --- FLUJO GPS OBLIGATORIO ---
bot.hears("📍 Iniciar Reporte", async (ctx) => {
  await updateSession(String(ctx.from.id), { state: "WAIT_LOC" });
  ctx.reply("📡 **PROCEDIMIENTO GPS:** Compartí tu ubicación actual para el radar, tú.", 
    Markup.keyboard([[Markup.button.locationRequest("📍 Enviar Ubicación Exacta")], ["⬅️ Menú"]]).oneTime().resize());
});

bot.on("location", async (ctx) => {
  const id = String(ctx.from.id);
  const user = await getProfile(id);
  if (user.state !== "WAIT_LOC") return;

  const { latitude: lat, longitude: lng } = ctx.message.location;
  let pais = "GLOBAL", ciudad = "Zona Rural";
  
  try {
    const geo = await axios.get(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, { timeout: 3500 });
    pais = geo.data?.address?.country_code?.toUpperCase() || "GLOBAL";
    ciudad = geo.data?.address?.city || geo.data?.address?.town || geo.data?.address?.state || "GPS";
  } catch (e) { console.warn("Falla Geo-API"); }

  await updateSession(id, { state: "WAIT_DESC", lat, lng, ciudad, pais });
  ctx.reply(`📍 **Localizado:** ${ciudad} (${pais}).\n\n¿Qué viste tú? Describilo para el mapa:`, Markup.removeKeyboard());
});

bot.on("text", async (ctx) => {
  const id = String(ctx.from.id);
  const user = await getProfile(id);
  const text = ctx.message.text;
  if (text === "⬅️ Menú" || !user) return;

  // Registro en Supabase
  if (user.state === "WAIT_DESC") {
    await supabase.from("reportes").insert({
      id: uuidv4(), user_id: id, lat: user.lat, lng: user.lng, ciudad: user.ciudad, pais: user.pais, descripcion: text, created_at: new Date().toISOString()
    });
    
    const alerta = `🚨 **AVISTAMIENTO**\n📍 ${user.ciudad} (${user.pais})\n📝 ${text}`;
    bot.telegram.sendMessage(CHANNELS[user.pais] || CHANNELS.GLOBAL, alerta).catch(() => {});
    bot.telegram.sendMessage(CHANNELS.CONOSUR, alerta).catch(() => {});

    await updateSession(id, { state: "IDLE", xp: (user.xp || 0) + 25 });
    return ctx.reply("✅ **Misión cumplida.** Reporte integrado al mapa táctico.", mainBtn);
  }

  // Inteligencia Artificial Gemini
  if (user.state === "IA_CHAT") {
    if (!user.is_premium && user.ai_count >= 3) return ctx.reply("🚫 Límite alcanzado. Hacete colaborador para IA ilimitada.");
    try {
      await ctx.sendChatAction("typing");
      const prompt = `Usuario: ${ctx.from.first_name}, Rango: ${user.xp}. Responde como Aifucito, uruguayo experto en OVNIs. Mensaje: ${text}`;
      const result = await aiModel.generateContent(prompt);
      const response = await result.response;
      await updateSession(id, { ai_count: (user.ai_count || 0) + 1 });
      return ctx.reply(`🛸 **Aifucito:** ${response.text()}`);
    } catch (e) { return ctx.reply("⚠️ Interferencia en la IA. Probá más tarde."); }
  }
});

bot.hears("🤖 Hablar con Aifucito", async (ctx) => {
  await updateSession(String(ctx.from.id), { state: "IA_CHAT" });
  ctx.reply("🛸 **Análisis de Señales:** ¿En qué te puedo ayudar tú?", Markup.keyboard([["⬅️ Menú"]]).resize());
});

bot.hears("🛰️ Ver Radar", (ctx) => {
  ctx.reply("🌍 **MAPA TÁCTICO LIVE:**", Markup.inlineKeyboard([
    [Markup.button.url("🗺️ Abrir Radar (24h)", `https://aifucito5-0.onrender.com?user_id=${ctx.from.id}`)]
  ]));
});

/* ==========================================
   📊 4. API PARA EL MAPA (FRONTEND)
========================================== */
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const RANGES = { "24h": 1, "7d": 7, "1m": 30, "1y": 365 };

app.get("/api/reportes", async (req, res) => {
  const range = req.query.range || "24h";
  const days = RANGES[range] ?? 1;
  const from = new Date(Date.now() - days * 86400000).toISOString();
  
  const { data } = await supabase.from("reportes").select("*").gte("created_at", from).order("created_at", { ascending: false });
  res.json(data || []);
});

/* ==========================================
   🛡️ 5. ADMINISTRACIÓN Y ESTABILIDAD
========================================== */
bot.command("broadcast", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const msg = ctx.message.text.replace("/broadcast ", "");
  const { data } = await supabase.from("sessions").select("user_id");
  for (const u of data) {
    await new Promise(r => setTimeout(r, 200));
    bot.telegram.sendMessage(u.user_id, `📢 **COMUNICADO:**\n\n${msg}`).catch(() => {});
  }
});

process.on("uncaughtException", (err) => console.error("CRASH PREVENIDO:", err));
process.on("unhandledRejection", (err) => console.error("PROMESA FALLIDA:", err));

bot.launch();
app.listen(process.env.PORT || 10000, () => console.log("📡 RADAR AIFU V12.9 ONLINE"));
