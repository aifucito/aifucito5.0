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
   🔐 VALIDACIÓN DE ENTORNO
========================================== */
const REQUIRED_ENV = ["BOT_TOKEN", "SUPABASE_URL", "SUPABASE_KEY", "GEMINI_API_KEY"];
REQUIRED_ENV.forEach(k => {
  if (!process.env[k]) {
    console.error(`❌ Falta variable: ${k}`);
    process.exit(1);
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const aiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

/* ==========================================
   🌐 SERVIDOR WEB
========================================== */
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => res.send("AIFU BOT ONLINE"));
app.get("/health", (req, res) => res.status(200).send("OK"));

app.get("/api/reportes", async (req, res) => {
  try {
    const { data } = await supabase.from("reportes").select("*");
    res.json(data || []);
  } catch {
    res.status(500).json([]);
  }
});

/* ==========================================
   🧠 SESIONES
========================================== */
const memory = new Map();
const lastUse = new Map();

async function getProfile(id) {
  if (memory.size > 1000) {
    const keys = Array.from(memory.keys()).slice(0, 200);
    keys.forEach(k => memory.delete(k));
  }

  if (memory.has(id)) return memory.get(id);

  let { data } = await supabase.from("sessions").select("*").eq("user_id", id).maybeSingle();

  if (!data) {
    data = { user_id: id, state: "IDLE", xp: 0, ai_count: 0 };
    await supabase.from("sessions").upsert(data);
  }

  memory.set(id, data);
  return data;
}

async function updateSession(id, payload) {
  const current = await getProfile(id);
  const updated = { ...current, ...payload };
  memory.set(id, updated);
  return supabase.from("sessions").update(payload).eq("user_id", id);
}

/* ==========================================
   📡 DIFUSIÓN
========================================== */
function getTargetChannels(pais) {
  const targets = [];
  const key = (pais || "GLOBAL").toUpperCase();

  if (process.env[`CHANNEL_${key}`]) targets.push(process.env[`CHANNEL_${key}`]);
  if (process.env.CHANNEL_GLOBAL) targets.push(process.env.CHANNEL_GLOBAL);

  return [...new Set(targets)];
}

/* ==========================================
   🚀 BOT
========================================== */
const menu = Markup.keyboard([
  ["📍 Iniciar Reporte", "👤 Mi Perfil"],
  ["🤖 IA"]
]).resize();

bot.use(session());

bot.start(async (ctx) => {
  await getProfile(String(ctx.from.id));
  ctx.reply("🛸 AIFU BOT ONLINE", menu);
});

/* ==========================================
   🧪 DEBUG CHAT ID (IMPORTANTE PARA VOS)
========================================== */
bot.on("message", (ctx, next) => {
  console.log("📡 CHAT ID:", ctx.chat.id, "| Tipo:", ctx.chat.type);
  return next();
});

/* ==========================================
   📍 REPORTE
========================================== */
bot.hears("📍 Iniciar Reporte", async (ctx) => {
  await updateSession(String(ctx.from.id), { state: "WAIT_LOC" });

  ctx.reply("Enviá tu ubicación:",
    Markup.keyboard([[Markup.button.locationRequest("📍 GPS")]]).resize()
  );
});

bot.on("location", async (ctx) => {
  const id = String(ctx.from.id);
  const user = await getProfile(id);

  if (user.state !== "WAIT_LOC") return;

  const { latitude: lat, longitude: lng } = ctx.message.location;

  await updateSession(id, { state: "WAIT_DESC", lat, lng });

  ctx.reply("Describí lo que viste:");
});

bot.on("text", async (ctx) => {
  const id = String(ctx.from.id);
  const text = ctx.message.text;

  const now = Date.now();
  if (now - (lastUse.get(id) || 0) < 2000) return;
  lastUse.set(id, now);

  const user = await getProfile(id);

  if (user.state === "WAIT_DESC") {
    await supabase.from("reportes").insert({
      id: uuidv4(),
      user_id: id,
      lat: user.lat,
      lng: user.lng,
      descripcion: text
    });

    const channels = getTargetChannels("GLOBAL");

    channels.forEach(ch => {
      console.log("📡 Enviando a:", ch);
      bot.telegram.sendMessage(ch, `🚨 REPORTE:\n${text}`).catch(console.error);
    });

    await updateSession(id, { state: "IDLE" });

    ctx.reply("Reporte enviado", menu);
  }

  if (user.state === "IA") {
    try {
      const result = await aiModel.generateContent(text);
      const reply = result?.response?.text() || "Sin respuesta";
      ctx.reply("🛸 " + reply);
    } catch {
      ctx.reply("⚠️ Error IA");
    }
  }
});

bot.hears("🤖 IA", async (ctx) => {
  await updateSession(String(ctx.from.id), { state: "IA" });
  ctx.reply("Modo IA activado. Escribí tu consulta.");
});

bot.hears("👤 Mi Perfil", async (ctx) => {
  const user = await getProfile(String(ctx.from.id));
  ctx.reply(`XP: ${user.xp || 0}`);
});

/* ==========================================
   🚀 START
========================================== */
const PORT = process.env.PORT || 10000;

app.listen(PORT, '0.0.0.0', async () => {
  console.log("🌐 Server ON");

  try {
    await bot.launch({ dropPendingUpdates: true });
    console.log("🤖 Bot ON");
  } catch (err) {
    console.error("❌ Error launch:", err.message);
  }
});

/* ==========================================
   🛡️ ANTI CRASH
========================================== */
process.on("unhandledRejection", err => console.error("❌ Promise:", err.message));
process.on("uncaughtException", err => console.error("❌ Exception:", err.message));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
