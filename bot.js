import "dotenv/config";
import { Telegraf, session, Markup } from "telegraf";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";

/* ==========================================
    🔐 CONFIGURACIÓN TÁCTICA
========================================== */
const ADMIN_IDS = ["7662736311"];
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

axios.defaults.timeout = 4000; 

const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const aiModel = genAI.getGenerativeModel({ 
  model: "gemini-1.5-flash",
  generationConfig: { temperature: 0.7, maxOutputTokens: 400 }
});

/* ==========================================
    🛡️ REINTENTO AUTOMÁTICO (DB)
========================================== */
async function safeInsert(table, data) {
  for (let i = 0; i < 2; i++) {
    const { error } = await supabase.from(table).insert(data);
    if (!error) return true;
    console.warn(`⚠️ Reintento en ${table} ${i+1}/2...`);
    await new Promise(r => setTimeout(r, 600));
  }
  return false;
}

/* ==========================================
    🌐 SERVIDOR WEB (API RADAR)
========================================== */
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/reportes", async (req, res) => {
  try {
    const range = req.query.range || "24h";
    const days = { "24h": 1, "7d": 7, "all": 3650 }[range] || 1;
    const fromDate = new Date(Date.now() - days * 86400000).toISOString();

    const { data } = await supabase
      .from("reportes")
      .select("*")
      .gte("created_at", fromDate)
      .order("created_at", { ascending: false });

    res.json(data || []);
  } catch (e) { res.status(500).json([]); }
});

/* ==========================================
    🧠 SESIONES (MEMORIA PROTEGIDA)
========================================== */
const memory = new Map();

async function getProfile(id) {
  if (memory.size > 1000) memory.clear(); 
  if (memory.has(id)) return memory.get(id);

  try {
    let { data } = await supabase.from("sessions").select("*").eq("user_id", id).maybeSingle();
    if (!data) {
      data = { user_id: id, state: "IDLE", xp: 0, ai_count: 0, is_premium: false };
      await supabase.from("sessions").upsert(data);
    }
    memory.set(id, data);
    return data;
  } catch (e) { return { user_id: id, state: "IDLE", xp: 0 }; }
}

async function updateSession(id, payload) {
  const current = await getProfile(id);
  const updated = { ...current, ...payload };
  memory.set(id, updated);
  return supabase.from("sessions").update(payload).eq("user_id", id);
}

/* ==========================================
    🎮 GAMIFICACIÓN (RANGOS)
========================================== */
const RANKS = [
  { xp: 0, name: "Recluta" },
  { xp: 50, name: "Observador" },
  { xp: 150, name: "Agente de Campo" },
  { xp: 400, name: "Investigador" },
  { xp: 800, name: "Analista" },
  { xp: 2000, name: "Comandante" }
];

/* ==========================================
    📡 RED DE DIFUSIÓN (UY, AR, CL, CONOSUR, GLOBAL)
========================================== */
function getTargetChannels(pais) {
  const targets = [];
  const key = (pais || "GLOBAL").toUpperCase();
  if (process.env[`CHANNEL_${key}`]) targets.push(process.env[`CHANNEL_${key}`]);
  if (process.env.CHANNEL_CONOSUR) targets.push(process.env.CHANNEL_CONOSUR);
  if (process.env.CHANNEL_GLOBAL) targets.push(process.env.CHANNEL_GLOBAL);
  return [...new Set(targets)];
}

/* ==========================================
    🚀 NÚCLEO BOT (INTERFACES)
========================================== */
const menu = Markup.keyboard([
  ["📍 Iniciar Reporte", "🛰️ Ver Radar"],
  ["👤 Mi Perfil", "🤖 Hablar con Aifucito"]
]).resize();

bot.use(session());
bot.catch((err) => { console.error("🔥 Error Telegraf:", err.message); });

bot.start(async (ctx) => {
  await getProfile(String(ctx.from.id));
  ctx.reply("🛸 AIFU ONLINE - SISTEMA DE VIGILANCIA", menu);
});

bot.hears("📍 Iniciar Reporte", async (ctx) => {
  await updateSession(String(ctx.from.id), { state: "WAIT_LOC" });
  ctx.reply("Enviá tu ubicación GPS:", 
    Markup.keyboard([[Markup.button.locationRequest("📍 GPS")]]).oneTime().resize()
  );
});

bot.on("location", async (ctx) => {
  const id = String(ctx.from.id);
  const user = await getProfile(id);
  if (user.state !== "WAIT_LOC") return;

  const { latitude: lat, longitude: lng } = ctx.message.location;
  let ciudad = "Zona GPS", pais = "GLOBAL";

  try {
    const geo = await axios.get(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
    ciudad = geo.data?.address?.city || geo.data?.address?.town || "Zona Rural";
    pais = geo.data?.address?.country_code?.toUpperCase() || "GLOBAL";
  } catch (e) { console.warn("⚠️ Geo Fallback"); }

  await updateSession(id, { state: "WAIT_DESC", lat, lng, ciudad, pais });
  ctx.reply(`📍 ${ciudad} (${pais})\n¿Qué viste tú? Describilo ahora:`, Markup.removeKeyboard());
});

bot.on("text", async (ctx) => {
  if (!ctx.message || !ctx.message.text) return;
  const id = String(ctx.from.id);
  const text = ctx.message.text;
  if (["📍 Iniciar Reporte", "🛰️ Ver Radar", "👤 Mi Perfil", "🤖 Hablar con Aifucito"].includes(text)) return;
  
  const user = await getProfile(id);

  // IA AIFUCITO
  if (user.state === "IA") {
    if (text.length < 2) return; 
    try {
      await ctx.sendChatAction("typing");
      const prompt = `Eres Aifucito, experto en ufología uruguaya. Responde corto y con modismos locales: ${text}`;
      const result = await aiModel.generateContent(prompt);
      const response = await result.response;
      return ctx.reply(`🛸 AIFUCITO: ${response.text()}`);
    } catch { return ctx.reply("⚠️ Interferencia en la IA."); }
  }

  // REPORTE FINAL
  if (user.state === "WAIT_DESC") {
    const ok = await safeInsert("reportes", {
      id: uuidv4(), user_id: id, lat: user.lat, lng: user.lng,
      descripcion: text, ciudad: user.ciudad, pais: user.pais,
      created_at: new Date().toISOString()
    });

    if (!ok) return ctx.reply("⚠️ Error guardando reporte.");

    const alertMsg = `🚨 **NUEVO REPORTE**\n📍 ${user.ciudad} (${user.pais})\n📝 ${text}\n👤 Agente: ${ctx.from.first_name || "Anónimo"}`;
    const channels = getTargetChannels(user.pais);
    
    for (const ch of channels) {
      bot.telegram.sendMessage(ch, alertMsg).catch(() => {});
    }

    await updateSession(id, { state: "IDLE", xp: user.xp + 25 });
    return ctx.reply("✅ Reporte enviado a la red y radar. +25 XP", menu);
  }
});

bot.hears("🤖 Hablar con Aifucito", async (ctx) => {
  await updateSession(String(ctx.from.id), { state: "IA" });
  ctx.reply("Aifucito escuchando... ¿Qué quieres saber tú hoy?");
});

bot.hears("👤 Mi Perfil", async (ctx) => {
  const user = await getProfile(String(ctx.from.id));
  const rank = [...RANKS].reverse().find(r => user.xp >= r.xp);
  ctx.reply(`🎖️ RANGO: ${rank.name}\n📊 XP: ${user.xp}`);
});

bot.hears("🛰️ Ver Radar", (ctx) => {
  ctx.reply("Radar Live:", {
    reply_markup: {
      inline_keyboard: [[{ text: "🌍 ABRIR MAPA", url: process.env.PUBLIC_URL || "https://aifucito5-0.onrender.com" }]]
    }
  });
});

/* ==========================================
    🧪 PRE-FLIGHT CHECK (MODO SEGURO)
========================================== */
async function preFlight() {
  console.log("🔍 ===============================");
  console.log("🔍 AIFU PRE-FLIGHT CHECK INICIADO");
  console.log("🔍 ===============================");

  let status = { telegram: false, db: false, ia: false, canales: false };

  try {
    const me = await bot.telegram.getMe();
    console.log(`✅ Telegram OK (@${me.username})`);
    status.telegram = true;
  } catch { console.log("❌ Telegram FAIL"); }

  try {
    const { error } = await supabase.from("reportes").select("id").limit(1);
    if (!error) { console.log("✅ Supabase OK"); status.db = true; } else throw error;
  } catch { console.log("❌ Supabase FAIL"); }

  try {
    const test = await aiModel.generateContent("ping");
    if (test) { console.log("✅ IA OK"); status.ia = true; }
  } catch { console.log("❌ IA FAIL"); }

  const canales = [
    process.env.CHANNEL_GLOBAL, process.env.CHANNEL_CONOSUR,
    process.env.CHANNEL_UY, process.env.CHANNEL_AR, process.env.CHANNEL_CL
  ].filter(Boolean);

  if (canales.length > 0) { 
    console.log(`✅ Canales detectados: ${canales.length}`); 
    status.canales = true;
  } else { console.log("❌ No hay canales configurados"); }

  const allOK = Object.values(status).every(v => v === true);
  const msg = allOK ? `🟢 **AIFU SYSTEM ONLINE**\n📡 Radar: ACTIVO\n🛰️ Red: OPERATIVA\n🤖 IA: CONECTADA\n🗄️ Base: SINCRONIZADA` 
                    : `⚠️ **AIFU INICIADO CON ERRORES**\nRevisar consola del sistema`;

  for (const ch of canales) {
    if (String(ch).startsWith("-100")) {
      await bot.telegram.sendMessage(ch, msg).catch(()=>{});
    }
  }
  console.log(allOK ? "🟢 SISTEMA COMPLETAMENTE OPERATIVO" : "🟠 SISTEMA CON FALLAS PARCIALES");
  console.log("🔍 ===============================");
}

/* ==========================================
    🚀 IGNICIÓN (OPTIMIZADO PARA RENDER)
========================================== */
const PORT = process.env.PORT || 10000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Puerto ${PORT} abierto. Avisando a Render...`);
  
  // Ejecutamos el chequeo y el arranque del bot después de abrir el puerto
  preFlight().then(() => {
    setTimeout(() => { 
      bot.launch()
        .then(() => console.log("🛸 BOT ONLINE"))
        .catch(err => console.error("❌ Fallo Launch:", err.message)); 
    }, 1000);
  });
});

/* ==========================================
    🛡️ BLINDAJE ANTI-CRASH
========================================== */
process.on("unhandledRejection", (err) => { console.error("❌ Fallo Promesa:", err.message); });
process.on("uncaughtException", (err) => { console.error("❌ Error Crítico:", err.message); });
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
