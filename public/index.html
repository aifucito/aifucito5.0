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
    ⚙️ 1. CONFIGURACIÓN Y TIMEOUTS
========================================== */
const ADMIN_IDS = ["7662736311"];
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

axios.defaults.timeout = 4000; // 🛡️ Evita cuelgues si las APIs externas fallan

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const bot = new Telegraf(process.env.BOT_TOKEN);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const aiModel = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
  generationConfig: { temperature: 0.7, maxOutputTokens: 400 }
});

const CHANNELS = {
  UY: process.env.CHANNEL_UY,
  AR: process.env.CHANNEL_AR,
  CL: process.env.CHANNEL_CL,
  GLOBAL: process.env.CHANNEL_GLOBAL,
  CONOSUR: process.env.CHANNEL_CONOSUR
};

/* ==========================================
    🔁 2. REINTENTO AUTOMÁTICO (PERSISTENCIA)
========================================== */
async function safeInsert(data) {
  for (let i = 0; i < 2; i++) {
    const { error } = await supabase.from("reportes").insert(data);
    if (!error) return true;
    console.warn(`⚠️ Reintento de guardado ${i+1}/2...`);
    await new Promise(r => setTimeout(r, 600));
  }
  return false;
}

/* ==========================================
    🧠 3. MOTOR DE SESIÓN (PROTECCIÓN DE RAM)
========================================== */
const memory = new Map();

async function getProfile(id) {
  if (memory.size > 1000) memory.clear(); // 🛡️ Limpieza de caché para Plan Starter
  
  if (memory.has(id)) return memory.get(id);
  try {
    const { data, error } = await supabase.from("sessions").select("*").eq("user_id", id).maybeSingle();
    if (error) throw error;
    
    if (!data) {
      const fresh = { user_id: id, state: "IDLE", xp: 0, ai_count: 0, is_premium: false };
      const { data: newUser } = await supabase.from("sessions").upsert(fresh).select().single();
      memory.set(id, newUser);
      return newUser;
    }
    memory.set(id, data);
    return data;
  } catch (e) {
    console.error("❌ Error Perfil DB:", e.message);
    return { user_id: id, state: "IDLE", xp: 0 };
  }
}

async function updateSession(id, payload) {
  const current = await getProfile(id);
  const updated = { ...current, ...payload };
  memory.set(id, updated);
  return supabase.from("sessions").update(payload).eq("user_id", id);
}

/* ==========================================
    🎛️ 4. INTERFAZ Y MENÚS
========================================== */
const menu = Markup.keyboard([
  ["📍 Iniciar Reporte", "🛰️ Ver Radar"],
  ["👤 Mi Perfil", "🤖 Aifucito"],
  ["⬅️ Menú"]
]).resize();

/* ==========================================
    🚀 5. NÚCLEO DEL BOT (OPERACIONES)
========================================== */
bot.catch((err, ctx) => {
  console.error(`🔥 Error global en ${ctx.updateType}:`, err);
});

bot.start(async (ctx) => {
  await getProfile(String(ctx.from.id));
  ctx.reply("🛸 RADAR AIFU V13.5 ONLINE\nSistemas blindados para vigilancia prolongada.", menu);
});

bot.hears("⬅️ Menú", async (ctx) => {
  await updateSession(String(ctx.from.id), { state: "IDLE" });
  ctx.reply("Sincronizando frecuencias...", menu);
});

bot.hears("👤 Mi Perfil", async (ctx) => {
  const u = await getProfile(String(ctx.from.id));
  ctx.reply(`🎖️ FICHA DE AGENTE\n👤 ID: ${u.user_id}\n📊 XP: ${u.xp || 0}`);
});

bot.hears("📍 Iniciar Reporte", async (ctx) => {
  await updateSession(String(ctx.from.id), { state: "WAITING_LOCATION" });
  ctx.reply("📡 PROTOCOLO GPS: Compartí tu ubicación actual:",
    Markup.keyboard([[Markup.button.locationRequest("📍 Enviar ubicación")], ["⬅️ Menú"]]).resize()
  );
});

bot.on("location", async (ctx) => {
  const id = String(ctx.from.id);
  const user = await getProfile(id);
  if (user.state !== "WAITING_LOCATION") return;

  const { latitude: lat, longitude: lng } = ctx.message.location;
  let ciudad = "Zona Rural", pais = "GLOBAL";

  try {
    const geo = await axios.get(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
    ciudad = geo.data?.address?.city || geo.data?.address?.town || "Zona GPS";
    pais = geo.data?.address?.country_code?.toUpperCase() || "GLOBAL";
  } catch (e) { console.warn("⚠️ Geo Fallback activo."); }

  await updateSession(id, { state: "WAITING_DESC", lat, lng, ciudad, pais });
  ctx.reply(`📍 Localizado: ${ciudad} (${pais})\n\n¿Qué viste tú? Describilo brevemente:`, Markup.removeKeyboard());
});

bot.on("text", async (ctx) => {
  if (!ctx.message || !ctx.message.text) return; // 🛡️ Blindaje contra nulos

  const id = String(ctx.from.id);
  const text = ctx.message.text;
  
  const botonesMenu = ["📍 Iniciar Reporte", "🛰️ Ver Radar", "👤 Mi Perfil", "🤖 Aifucito", "⬅️ Menú"];
  if (botonesMenu.includes(text)) return;

  const user = await getProfile(id);
  if (!user) return;

  /* --- LÓGICA DE REPORTE --- */
  if (user.state === "WAITING_DESC") {
    try {
      const ok = await safeInsert({
        id: uuidv4(), user_id: id, lat: user.lat, lng: user.lng, ciudad: user.ciudad, pais: user.pais, descripcion: text
      });

      if (!ok) throw new Error("Insert falló después de reintentos");

      const msg = `🚨 **NUEVO REPORTE**\n📍 ${user.ciudad} (${user.pais})\n👤 Agente: ${ctx.from.first_name}\n📝 ${text}`;
      const canal = CHANNELS[user.pais] || CHANNELS.GLOBAL;

      if (canal) bot.telegram.sendMessage(canal, msg).catch(e => console.warn("❌ Canal:", e.message));
      if (CHANNELS.CONOSUR) bot.telegram.sendMessage(CHANNELS.CONOSUR, msg).catch(e => console.warn("❌ Conosur:", e.message));

      await updateSession(id, { state: "IDLE", xp: (user.xp || 0) + 25 });
      return ctx.reply("✅ Reporte enviado al Radar. +25 XP", menu);

    } catch (e) {
      console.error("❌ Error Guardado:", e.message);
      return ctx.reply("⚠️ Error crítico al sincronizar. Reintentá luego.");
    }
  }

  /* --- LÓGICA DE IA (AIFUCITO) --- */
  if (user.state === "IA") {
    if (text.length < 2) return; // 🛡️ Evita procesar ruido o mensajes de 1 solo caracter

    try {
      await ctx.sendChatAction("typing");
      const prompt = `Eres Aifucito, un experto en ufología de Uruguay. Responde de forma breve, con un toque de misterio y usando modismos uruguayos/rioplatenses. Pregunta del agente: ${text}`;
      const result = await aiModel.generateContent(prompt);
      const response = await result.response;
      return ctx.reply(`🛸 AIFUCITO: ${response.text()}`);
    } catch (e) { 
      console.error("❌ Error IA:", e.message);
      return ctx.reply("⚠️ Interferencia en la IA. Reintentá."); 
    }
  }
});

bot.hears("🤖 Aifucito", async (ctx) => {
  await updateSession(String(ctx.from.id), { state: "IA" });
  ctx.reply("🛸 MODO IA ACTIVADO.\nAifucito escuchando... ¿Qué quieres saber tú hoy?", Markup.keyboard([["⬅️ Menú"]]).resize());
});

bot.hears("🛰️ Ver Radar", (ctx) => {
  ctx.reply("🌍 **MAPA TÁCTICO AIFU:**",
    Markup.inlineKeyboard([[Markup.button.url("🗺️ ABRIR RADAR LIVE", "https://aifucito5-0.onrender.com")]])
  );
});

/* ==========================================
    🌐 6. API + SERVIDOR EXPRESS
========================================== */
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/reportes", async (req, res) => {
  try {
    const { data, error } = await supabase.from("reportes").select("id, lat, lng, descripcion, ciudad, pais, created_at").order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: "Falla de radar" });
  }
});

/* ==========================================
    🚀 7. IGNICIÓN (RENDER OPTIMIZED)
========================================== */
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`📡 Nodo AIFU Online en puerto ${PORT}`);
  setTimeout(() => {
    bot.launch()
      .then(() => console.log("🛸 Bot Desplegado"))
      .catch(console.error);
  }, 1000);
});

/* ==========================================
    🛡️ 8. BLINDAJE ANTI-CRASH GLOBAL
========================================== */
process.on("unhandledRejection", (err) => { console.error("❌ Fallo Promesa:", err); });
process.on("uncaughtException", (err) => { console.error("❌ Error Crítico:", err); });

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
