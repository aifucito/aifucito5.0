import "dotenv/config";
import { Telegraf, Markup, session } from "telegraf";
import axios from "axios";
import express from "express";
import { createClient } from "@supabase/supabase-js";

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
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* =========================
   EXPRESS (OBLIGATORIO RENDER)
========================= */

const app = express();

app.get("/", (req, res) => {
  res.send("AIFUCITO ONLINE OK");
});

/* 🔧 FIX RENDER PORT */
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Servidor activo en puerto", PORT);
});

/* =========================
   SESSION
========================= */

bot.use(session());

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
  return "🧹 Fajinador de retretos espaciales";
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
   USUARIO (SAFE)
========================= */

async function ensureUser(ctx) {
  const id = String(ctx.from.id);

  const { data } = await supabase
    .from("usuarios")
    .select("*")
    .eq("id", id)
    .maybeSingle();

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
      rango: report.rango || 1,
      tipo: report.tipo || "avistamiento",
      descripcion: report.descripcion,
      precision: report.precision || 1,
      pais: report.pais || "GLOBAL",
      alerta_generada: false,
    },
  ]);

  const { data } = await supabase
    .from("usuarios")
    .select("reportes")
    .eq("id", String(ctx.from.id))
    .maybeSingle();

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
      .catch(() => {});
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
    .maybeSingle();

  ctx.reply(
`👤 Perfil

Nombre: ${data?.nombre || "-"}
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
  const text = ctx.message.text;

  if (ctx.session?.mode === "ia") {
    const r = await llamarGemini(text);
    ctx.reply(r);
    ctx.session.mode = null;
    return;
  }

  if (text.includes(",")) {
    const parts = text.split(",");

    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    const pais = parts[2] || "GLOBAL";

    if (isNaN(lat) || isNaN(lng)) {
      return ctx.reply("Formato inválido. Usa: lat,lng,pais");
    }

    ctx.session.lat = lat;
    ctx.session.lng = lng;
    ctx.session.pais = pais;
    ctx.session.step = "desc";

    return ctx.reply("Describe el fenómeno:");
  }

  if (ctx.session?.step === "desc") {
    const report = {
      lat: ctx.session.lat,
      lng: ctx.session.lng,
      descripcion: text,
      pais: ctx.session.pais,
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
   BOT START
========================= */

bot.launch();
console.log("AIFUCITO ONLINE");
