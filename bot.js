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
   EXPRESS (RENDER FIX)
========================= */

const app = express();

app.get("/", (req, res) => {
  res.send("AIFUCITO ONLINE OK");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Servidor activo en puerto", PORT);
});

/* =========================
   SESSION SAFE
========================= */

bot.use(session());
bot.use((ctx, next) => {
  ctx.session = ctx.session || {};
  return next();
});

/* =========================
   RANGO
========================= */

function obtenerRango(user = {}) {
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
   GEO REAL (NOMINATIM)
========================= */

async function reverseGeo(lat, lng) {
  try {
    const res = await axios.get(
      "https://nominatim.openstreetmap.org/reverse",
      {
        params: {
          format: "json",
          lat,
          lon: lng,
        },
        headers: {
          "User-Agent": "AIFUCITO-BOT"
        }
      }
    );

    const a = res.data?.address || {};

    return {
      pais: a.country_code?.toUpperCase() || "GLOBAL",
      ciudad: a.city || a.town || a.village || "Desconocido",
      localidad: a.suburb || a.neighbourhood || "Desconocido",
      full: res.data?.display_name || ""
    };
  } catch {
    return {
      pais: "GLOBAL",
      ciudad: "Desconocido",
      localidad: "Desconocido",
      full: ""
    };
  }
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
   GUARDAR REPORTE + BACKUP
========================= */

async function saveReport(ctx, report) {
  await supabase.from("reportes").insert([
    {
      user_id: String(ctx.from.id),
      lat: report.lat,
      lng: report.lng,
      rango: 1,
      tipo: "avistamiento",
      descripcion: report.descripcion,
      precision: 1,
      pais: report.pais,
      ciudad: report.ciudad,
      localidad: report.localidad,
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

  /* BACKUP TELEGRAM */
  await bot.telegram.sendMessage(
    CHANNEL_GLOBAL,
    JSON.stringify(report, null, 2)
  ).catch(() => {});
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
Rango: ${obtenerRango(data)}`
  );
});

/* =========================
   MAPA
========================= */

bot.hears("🗺 Mapa", (ctx) => {
  ctx.reply("Radar activo", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Abrir mapa", url: "https://aifucito5-0.onrender.com" }]
      ]
    }
  });
});

/* =========================
   REPORTAR GPS
========================= */

bot.hears("📍 Reportar", (ctx) => {
  ctx.session.step = "gps";

  ctx.reply("Envía tu ubicación GPS:", {
    reply_markup: {
      keyboard: [
        [{ text: "📡 Enviar GPS", request_location: true }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  });
});

/* =========================
   LOCATION
========================= */

bot.on("location", (ctx) => {
  if (ctx.session.step !== "gps") return;

  ctx.session.lat = ctx.message.location.latitude;
  ctx.session.lng = ctx.message.location.longitude;
  ctx.session.step = "desc";

  ctx.reply("Ubicación recibida. Describe el fenómeno:");
});

/* =========================
   FLUJO TEXTO
========================= */

bot.on("text", async (ctx) => {
  const text = ctx.message.text;

  if (ctx.session.mode === "ia") {
    const r = await llamarGemini(text);
    ctx.reply(r);
    ctx.session.mode = null;
    return;
  }

  if (ctx.session.step === "desc") {

    const geo = await reverseGeo(ctx.session.lat, ctx.session.lng);

    const report = {
      lat: ctx.session.lat,
      lng: ctx.session.lng,
      descripcion: text,
      pais: geo.pais,
      ciudad: geo.ciudad,
      localidad: geo.localidad,
    };

    await saveReport(ctx, report);

    await enviarAlerta(report.pais, `
📍 País: ${report.pais}
🏙 Ciudad: ${report.ciudad}
📌 Localidad: ${report.localidad}
🛰 Evento registrado
`);

    ctx.session = {};
    return ctx.reply("Reporte enviado 🛰");
  }
});

/* =========================
   BOT START
========================= */

bot.launch();
console.log("AIFUCITO ONLINE");
