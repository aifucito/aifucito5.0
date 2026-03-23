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

axios.defaults.timeout = 4000;

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
  if (memory.size > 1000) memory.clear();
  
  if (memory.has(id)) return memory.get(id);

  try {
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("user_id", id)
      .maybeSingle();

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

  try {
    return await supabase.from("sessions").update(payload).eq("user_id", id);
  } catch (e) {
    console.warn("⚠️ Error updateSession:", e.message);
  }
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
    🚀 5. NÚCLEO DEL BOT
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
  } catch {
    console.warn("⚠️ Geo fallback");
  }

  await updateSession(id, { state: "WAITING_DESC", lat, lng, ciudad, pais });
  ctx.reply(`📍 Localizado: ${ciudad} (${pais})\n\n¿Qué viste tú? Describilo brevemente:`, Markup.removeKeyboard());
});

bot.on("text", async (ctx) => {
  if (!ctx.message || !ctx.message.text) return;

  const id = String(ctx.from.id);
  const text = ctx.message.text;

  const botonesMenu = ["📍 Iniciar Reporte", "🛰️ Ver Radar", "👤 Mi Perfil", "🤖 Aifucito", "⬅️ Menú"];
  if (botonesMenu.includes(text)) return;

  const user = await getProfile(id);
  if (!user) return;

  if (user.state === "WAITING_DESC") {
    try {
      const ok = await safeInsert({
        id: uuidv4(),
        user_id: id,
        lat: user.lat,
        lng: user.lng,
        ciudad: user.ciudad,
        pais: user.pais,
        descripcion: text
      });

      if (!ok) throw new Error("Insert falló");

      const msg = `🚨 **NUEVO REPORTE**\n📍 ${user.ciudad} (${user.pais})\n👤 Agente: ${ctx.from.first_name}\n📝 ${text}`;
      const canal = CHANNELS[user.pais] || CHANNELS.GLOBAL;

      if (canal) bot.telegram.sendMessage(canal, msg).catch(() => {});
      if (CHANNELS.CONOSUR) bot.telegram.sendMessage(CHANNELS.CONOSUR, msg).catch(() => {});

      await updateSession(id, { state: "IDLE", xp: (user.xp || 0) + 25 });
      return ctx.reply("✅ Reporte enviado al Radar. +25 XP", menu);

    } catch (e) {
      console.error("❌ Error Guardado:", e.message);
      return ctx.reply("⚠️ Error crítico al sincronizar.");
    }
  }

  if (user.state === "IA") {
    if (text.length < 2) return;

    try {
      await ctx.sendChatAction("typing");
      const prompt = `Eres Aifucito, experto en ufología de Uruguay. Responde breve con modismos locales. Pregunta: ${text}`;
      const result = await aiModel.generateContent(prompt);
      const response = await result.response;
      return ctx.reply(`🛸 AIFUCITO: ${response.text()}`);
    } catch {
      return ctx.reply("⚠️ Interferencia en la IA.");
    }
  }
});

bot.hears("🤖 Aifucito", async (ctx) => {
  await updateSession(String(ctx.from.id), { state: "IA" });
  ctx.reply("🛸 MODO IA ACTIVADO.\nAifucito escuchando...", Markup.keyboard([["⬅️ Menú"]]).resize());
});

bot.hears("🛰️ Ver Radar", (ctx) => {
  ctx.reply("🌍 **MAPA TÁCTICO AIFU:**",
    Markup.inlineKeyboard([[Markup.button.url("🗺️ ABRIR RADAR LIVE", "https://aifucito5-0.onrender.com")]])
  );
});

/* ==========================================
    🌐 6. SERVIDOR EXPRESS
========================================== */
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// 🔥 FIX CLAVE: ruta raíz para Render
app.get("/", (req, res) => {
  res.send("🛸 AIFU BOT ONLINE");
});

app.get("/api/reportes", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("reportes")
      .select("id, lat, lng, descripcion, ciudad, pais, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;
    res.json(data || []);

  } catch {
    res.status(500).json({ error: "Falla de radar" });
  }
});

/* ==========================================
    🚀 7. IGNICIÓN
========================================== */
const PORT = process.env.PORT || 10000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`📡 Nodo AIFU Online en puerto ${PORT}`);
});

// 🔥 FIX CLAVE: bot arranca directo
bot.launch()
  .then(() => console.log("🛸 Bot Desplegado"))
  .catch(console.error);

/* ==========================================
    🛡️ 8. ANTI-CRASH
========================================== */
process.on("unhandledRejection", (err) => console.error("❌ Promesa:", err));
process.on("uncaughtException", (err) => console.error("❌ Crítico:", err));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
