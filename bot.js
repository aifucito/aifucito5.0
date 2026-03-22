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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ==========================================
   💎 CONEXIÓN DE SISTEMAS
========================================== */
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const bot = new Telegraf(process.env.BOT_TOKEN);

const aiModel = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  .getGenerativeModel({ model: "gemini-1.5-flash" });

const ADMIN_ID = "7662736311";
const CHANNELS = { UY: process.env.CHANNEL_UY, GLOBAL: process.env.CHANNEL_GLOBAL };

/* ==========================================
   🧠 MOTOR IA
========================================== */
const AIFU_PROMPT = `Eres Aifucito, investigador uruguayo sociable. Usa lenguaje rioplatense neutro con modismos suaves como "bo", "ta". Ayudas en análisis de OVNIs.`;

/* ==========================================
   📂 SESIONES (FIX: sincronización segura)
========================================== */
const getSession = async (id) => {
  let { data } = await supabase.from("sessions").select("*").eq("user_id", String(id)).maybeSingle();

  if (!data) {
    data = { user_id: String(id), state: "IDLE", xp: 0, ai_count: 0, is_premium: false };
    await supabase.from("sessions").upsert(data);
  }

  return data;
};

/* ==========================================
   🚀 UI BOT (SIN CAMBIOS DE RUTAS)
========================================== */
const menuPrincipal = Markup.keyboard([
  ["📍 Reportar Avistamiento", "🛰️ Ver Radar"],
  ["🤖 Charlar con Aifucito", "👤 Mi Perfil"],
  ["💎 Ser Premium", "⬅️ Salir"]
]).resize();

/* ==========================================
   START
========================================== */
bot.start(async (ctx) => {
  await getSession(ctx.from.id);
  ctx.reply("🌌 AIFU CONTROL CENTER ACTIVO", menuPrincipal);
});

/* ==========================================
   RESET
========================================== */
bot.hears("⬅️ Salir", async (ctx) => {
  await supabase.from("sessions")
    .update({ state: "IDLE" })
    .eq("user_id", String(ctx.from.id));

  ctx.reply("En espera...", menuPrincipal);
});

/* ==========================================
   PERFIL
========================================== */
bot.hears("👤 Mi Perfil", async (ctx) => {
  const s = await getSession(ctx.from.id);

  ctx.reply(
    `🎖️ PERFIL\nXP: ${s.xp}\nPremium: ${s.is_premium ? "SI" : "NO"}\nIA: ${s.ai_count}/3`
  );
});

/* ==========================================
   RADAR (SIN CAMBIOS DE RUTA)
========================================== */
bot.hears("🛰️ Ver Radar", (ctx) => {
  const url = `https://${process.env.APP_NAME}.onrender.com?user_id=${ctx.from.id}`;

  ctx.reply(
    "🌍 RADAR ACTIVO",
    Markup.inlineKeyboard([
      [Markup.button.url("🗺️ MAPA EN VIVO", url)]
    ])
  );
});

/* ==========================================
   REPORTAR
========================================== */
bot.hears("📍 Reportar Avistamiento", async (ctx) => {
  await supabase.from("sessions")
    .update({ state: "ESPERANDO_UBICACION" })
    .eq("user_id", String(ctx.from.id));

  ctx.reply(
    "📡 Enviar ubicación:",
    Markup.keyboard([[Markup.button.locationRequest("📍 ENVIAR")]])
      .oneTime()
      .resize()
  );
});

/* ==========================================
   FIX 1 — LOCATION (SINCRONIZADO)
========================================== */
bot.on("location", async (ctx) => {
  const id = String(ctx.from.id);
  const { latitude: lat, longitude: lng } = ctx.message.location;

  let ciudad = "Zona Rural";

  try {
    const res = await axios.get(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
    );
    ciudad = res.data?.address?.city || res.data?.address?.town || "GPS";
  } catch {}

  await supabase.from("sessions")
    .update({ state: "ESPERANDO_DESCRIPCION", lat, lng, ciudad })
    .eq("user_id", id);

  ctx.reply(`📍 ${ciudad}\nDescribe el avistamiento:`, Markup.removeKeyboard());
});

/* ==========================================
   FIX 2 — TEXT GLOBAL CONTROLADO
========================================== */
bot.on("text", async (ctx) => {
  const id = String(ctx.from.id);
  const s = await getSession(id);
  const texto = ctx.message.text;

  if (texto === "⬅️ Salir") return;

/* ==========================
   VALIDACIÓN DE ESTADO (FIX)
========================== */
  if (!["ESPERANDO_DESCRIPCION", "IA_CHAT"].includes(s.state)) return;

/* ==========================
   REPORTES (FIX VALIDACIÓN)
========================== */
  if (s.state === "ESPERANDO_DESCRIPCION") {

    if (!s.lat || !s.lng || texto.length < 5) {
      return ctx.reply("Reporte inválido.");
    }

    const reporte = {
      id: uuidv4(),
      user_id: id,
      lat: s.lat,
      lng: s.lng,
      ciudad: s.ciudad,
      descripcion: texto,
      created_at: new Date().toISOString()
    };

    await supabase.from("reportes").insert(reporte);

    bot.telegram.sendMessage(
      CHANNELS.UY,
      `🚨 AVISTAMIENTO\n📍 ${s.ciudad}\n📝 ${texto}`
    ).catch(() => {});

    await supabase.from("sessions")
      .update({ state: "IDLE", xp: (s.xp || 0) + 50 })
      .eq("user_id", id);

    return ctx.reply("REPORTE ARCHIVADO +50 XP", menuPrincipal);
  }

/* ==========================
   IA (FIX + SIN MEMORIA ROTA)
========================== */
  if (s.state === "IA_CHAT") {

    if (!s.is_premium && s.ai_count >= 3) {
      return ctx.reply("Límite IA alcanzado.");
    }

    try {
      await ctx.sendChatAction("typing");

      const result = await aiModel.generateContent(
        `${AIFU_PROMPT}\nUsuario: ${texto}`
      );

      await supabase.from("sessions")
        .update({ ai_count: (s.ai_count || 0) + 1 })
        .eq("user_id", id);

      ctx.reply(`🛸 ${result.response.text()}`);

    } catch {
      ctx.reply("Error IA.");
    }
  }
});

/* ==========================================
   IA ENTRY
========================================== */
bot.hears("🤖 Charlar con Aifucito", async (ctx) => {
  await supabase.from("sessions")
    .update({ state: "IA_CHAT" })
    .eq("user_id", String(ctx.from.id));

  ctx.reply("Canal abierto", Markup.keyboard([["⬅️ Salir"]]).resize());
});

/* ==========================================
   PREMIUM (SIN CAMBIOS)
========================================== */
bot.hears("💎 Ser Premium", (ctx) => {
  ctx.reply("Contacta al administrador para activación.");
});

bot.launch();

/* ==========================================
   SERVER RADAR (SIN CAMBIOS DE RUTA)
========================================== */
const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/reportes", async (req, res) => {
  const { data } = await supabase
    .from("reportes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  res.json(data || []);
});

app.listen(process.env.PORT || 10000, () =>
  console.log("SISTEMA ACTIVO")
);
