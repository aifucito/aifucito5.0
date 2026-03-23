import "dotenv/config";
import { Telegraf, Markup, session } from "telegraf";
import express from "express";
import axios from "axios";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";

// ===============================
// 🔐 CONFIG
// ===============================
const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const GEMINI_KEY = process.env.VARIANT;

// ===============================
// 🧠 SESIONES
// ===============================
bot.use(session());

// ===============================
// 🧠 IA (TONO URUGUAYO NEUTRO)
// ===============================
async function askAI(text) {
  try {
    const prompt = `
Respondé en tono neutro uruguayo, claro y profesional.
No uses exageraciones ni informalidad excesiva.
Usuario: ${text}
`;

    const res = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 300
        }
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": GEMINI_KEY
        }
      }
    );

    return res.data.candidates?.[0]?.content?.parts?.[0]?.text || "Sin respuesta";
  } catch {
    return "Error en IA";
  }
}

// ===============================
// 🧑‍🚀 GAMIFICACIÓN
// ===============================
function getLevel(xp) {
  if (xp < 100) return "Recluta";
  if (xp < 300) return "Agente de Campo";
  if (xp < 700) return "Investigador";
  if (xp < 1500) return "Analista AIFU";
  return "Comandante AIFU";
}

// ===============================
// 📊 XP SYSTEM
// ===============================
async function addXP(userId, amount) {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  let xp = (data?.xp || 0) + amount;

  await supabase.from("profiles").upsert({
    user_id: userId,
    xp,
    level: getLevel(xp)
  });
}

// ===============================
// 🚀 START
// ===============================
bot.start(async (ctx) => {
  return ctx.reply(
    "🛸 AIFU SYSTEM ONLINE",
    Markup.keyboard([
      ["📡 Reportar Avistamiento", "🛰 Ver Radar"],
      ["🧠 IA Aifucito", "👤 Perfil"]
    ]).resize()
  );
});

// ===============================
// 📡 FLUJO DE REPORTE
// ===============================
bot.hears("📡 Reportar Avistamiento", async (ctx) => {
  ctx.session.step = "text";
  return ctx.reply("Describe lo que viste:");
});

bot.on("text", async (ctx) => {
  if (!ctx.session?.step) return;

  if (ctx.session.step === "text") {
    ctx.session.desc = ctx.message.text;
    ctx.session.step = "location";
    return ctx.reply("Envíame la ubicación GPS");
  }

  // IA chat
  if (ctx.session.ai) {
    ctx.session.ai = false;
    const res = await askAI(ctx.message.text);
    return ctx.reply(res);
  }
});

// ubicación
bot.on("location", async (ctx) => {
  if (ctx.session.step !== "location") return;

  const { latitude, longitude } = ctx.message.location;

  const report = {
    id: uuidv4(),
    user_id: ctx.from.id,
    descripcion: ctx.session.desc,
    lat: latitude,
    lng: longitude,
    created_at: new Date()
  };

  await supabase.from("reports").insert(report);

  await addXP(ctx.from.id, 25);

  ctx.session = {};

  return ctx.reply("✅ Reporte registrado y visible en el radar");
});

// ===============================
// 🧠 IA AIFUCITO
// ===============================
bot.hears("🧠 IA Aifucito", (ctx) => {
  ctx.session.ai = true;
  return ctx.reply("Consultá lo que quieras:");
});

// ===============================
// 👤 PERFIL
// ===============================
bot.hears("👤 Perfil", async (ctx) => {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", ctx.from.id)
    .single();

  const xp = data?.xp || 0;
  const level = getLevel(xp);

  return ctx.reply(
    `👤 Perfil AIFU\n\nXP: ${xp}\nNivel: ${level}`
  );
});

// ===============================
// 🛰 RADAR
// ===============================
bot.hears("🛰 Ver Radar", (ctx) => {
  const url = `${process.env.PUBLIC_URL}/index.html?user_id=${ctx.from.id}`;
  return ctx.reply("Radar en vivo:", {
    reply_markup: {
      inline_keyboard: [[{ text: "Abrir Radar", url }]]
    }
  });
});

// ===============================
// 🌐 API REPORTES
// ===============================
app.use(express.json());
app.use(express.static("public"));

app.get("/api/reportes", async (req, res) => {
  const { data, error } = await supabase.from("reports").select("*");

  if (error) return res.status(500).json(error);

  res.json(data);
});

// ===============================
// 🚀 START SYSTEM
// ===============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => console.log("🌐 SERVER ON"));

bot.launch();

console.log("🛸 AIFU FINAL SYSTEM ONLINE");
