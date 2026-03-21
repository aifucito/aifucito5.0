import "dotenv/config";
import { Telegraf, Markup, session } from "telegraf";
import express from "express";
import cors from "cors";
import axios from "axios";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import { fileURLToPath } from "url";

/* =========================
   CONFIG
========================= */

const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const ADMIN_ID = process.env.ADMIN_ID;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

/* 📡 CANALES */
const CHANNEL_CONO_SUR = process.env.CHANNEL_CONO_SUR;
const CHANNEL_GLOBAL = process.env.CHANNEL_GLOBAL;
const CHANNEL_UY = process.env.CHANNEL_UY;
const CHANNEL_AR = process.env.CHANNEL_AR;
const CHANNEL_CL = process.env.CHANNEL_CL;

const bot = new Telegraf(BOT_TOKEN);
const app = express();

app.use(cors());
app.use(express.json());

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* =========================
   FRONTEND
========================= */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* =========================
   SESSION
========================= */

bot.use(session({ defaultSession: () => ({}) }));

/* =========================
   RANGO
========================= */

function obtenerRango(user) {
  if (String(user?.id) === String(ADMIN_ID))
    return "👑 Comandante Intergaláctico";

  const r = user?.reportes || 0;

  if (r >= 20) return "casi te busca la CRIDOVNI";
  if (r >= 10) return "👽 Guardaespalda de Alf";
  if (r >= 5) return "🧉 Cebador de mate del Área 51";
  return "🧹 Fajinador de retretes espaciales";
}

/* =========================
   MENU
========================= */

function menu() {
  return Markup.keyboard([
    ["📍 Reportar"],
    ["🗺 Mapa"],
    ["🤖 Aifucito"],
    ["👤 Perfil"],
  ]).resize();
}

/* =========================
   USUARIO
========================= */

async function ensureUser(ctx) {
  const id = String(ctx.from.id);

  const { data } = await supabase
    .from("usuarios")
    .select("*")
    .eq("id", id)
    .single();

  if (data) return data;

  const newUser = {
    id,
    nombre: ctx.from.username || ctx.from.first_name,
    rol: id === String(ADMIN_ID) ? "admin" : "user",
    reportes: 0,
  };

  await supabase.from("usuarios").insert([newUser]);

  return newUser;
}

/* =========================
   GUARDAR REPORTE
========================= */

async function saveReport(ctx, report) {
  await supabase.from("reportes").insert([
    {
      user_id: String(ctx.from.id),
      lat: report.lat,
      lng: report.lng,
      rango: report.rango || 1.0,
      tipo: report.tipo || "avistamiento",
      descripcion: report.descripcion,
      precision: report.precision || 1.0,
      pais: report.pais || "GLOBAL",
      alerta_generada: false
      // created_at lo maneja Supabase (now())
    },
  ]);

  const { data } = await supabase
    .from("usuarios")
    .select("reportes")
    .eq("id", String(ctx.from.id))
    .single();

  await supabase
    .from("usuarios")
    .update({ reportes: (data?.reportes || 0) + 1 })
    .eq("id", String(ctx.from.id));
}

/* =========================
   GEMINI IA
========================= */

async function llamarGemini(text) {
  try {
    const res = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent",
      {
        contents: [{
          parts: [{ text: "Aifucito IA:\n" + text }]
        }]
      },
      { params: { key: GEMINI_KEY } }
    );

    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || "sin respuesta IA";
  } catch {
    return "error IA";
  }
}

/* =========================
   CANALES
========================= */

function getChannels(pais) {
  const p = (pais || "").toUpperCase();

  let canales = [CHANNEL_CONO_SUR];

  if (p === "UY") canales.push(CHANNEL_UY);
  else if (p === "AR") canales.push(CHANNEL_AR);
  else if (p === "CL") canales.push(CHANNEL_CL);
  else canales.push(CHANNEL_GLOBAL);

  return [...new Set(canales)];
}

/* =========================
   ALERTAS
========================= */

async function enviarAlerta(pais, mensaje) {
  const canales = getChannels(pais);

  for (const c of canales) {
    if (!c) continue;

    await bot.telegram.sendMessage(c, "🚨 ALERTA AIFU\n\n" + mensaje)
      .catch(e => console.log(e.message));
  }
}

/* =========================
   START
========================= */

bot.start(async (ctx) => {
  await ensureUser(ctx);
  ctx.reply("🛰 Aifucito activo", menu());
});

/* =========================
   IA MODE
========================= */

bot.hears("🤖 Aifucito", (ctx) => {
  ctx.session.mode = "ia";
  ctx.reply("Escribe consulta");
});

/* =========================
   PERFIL
========================= */

bot.hears("👤 Perfil", async (ctx) => {
  const { data } = await supabase
    .from("usuarios")
    .select("*")
    .eq("id", String(ctx.from.id))
    .single();

  ctx.reply(
`👤 Perfil

Nombre: ${data?.nombre}
Reportes: ${data?.reportes || 0}
Rango: ${obtenerRango(data || {})}`
  );
});

/* =========================
   MAPA
========================= */

bot.hears("🗺 Mapa", (ctx) => {
  ctx.reply("Radar activo", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Abrir mapa", url: "https://ipusito5-0.onrender.com" }]
      ]
    }
  });
});

/* =========================
   FLUJO GENERAL
========================= */

bot.on("text", async (ctx) => {

  if (ctx.session?.mode === "ia") {
    const r = await llamarGemini(ctx.message.text);
    ctx.reply(r);
    ctx.session.mode = null;
    return;
  }

  // 📍 lat,lng,pais
  if (ctx.message.text.includes(",")) {
    const parts = ctx.message.text.split(",");

    ctx.session.lat = parseFloat(parts[0]);
    ctx.session.lng = parseFloat(parts[1]);
    ctx.session.pais = parts[2] || "GLOBAL";
    ctx.session.step = "desc";

    return ctx.reply("Describe el fenómeno:");
  }

  if (ctx.session?.step === "desc") {

    const report = {
      lat: ctx.session.lat,
      lng: ctx.session.lng,
      descripcion: ctx.message.text,
      pais: ctx.session.pais,
      rango: 1.0,
      precision: 1.0
    };

    await saveReport(ctx, report);

    await enviarAlerta(report.pais, `
📍 País: ${report.pais}
📌 Descripción: ${report.descripcion}
🛰 Nuevo evento registrado
`);

    ctx.session = null;
    return ctx.reply("Reporte enviado 🛰");
  }
});

/* =========================
   API MAPA
========================= */

app.get("/api/reports", async (req, res) => {
  const { data } = await supabase.from("reportes").select("*");
  res.json(data || []);
});

/* =========================
   SERVER
========================= */

const PORT = process.env.PORT;

app.listen(PORT, () => {
  console.log("SERVER ON", PORT);
});

bot.launch();
console.log("AIFUCITO ONLINE");
