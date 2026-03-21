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

const CHANNEL_GLOBAL = process.env.CHANNEL_GLOBAL;
const CHANNEL_CONO_SUR = process.env.CHANNEL_CONO_SUR;
const CHANNEL_UY = process.env.CHANNEL_UY;
const CHANNEL_AR = process.env.CHANNEL_AR;
const CHANNEL_CL = process.env.CHANNEL_CL;

const bot = new Telegraf(BOT_TOKEN);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* =========================
   EXPRESS (RENDER)
========================= */

const app = express();
app.get("/", (_, res) => res.send("AIFUCITO ONLINE OK"));
app.listen(process.env.PORT || 3000, "0.0.0.0");

/* =========================
   SESSION
========================= */

bot.use(session());
bot.use((ctx, next) => {
  ctx.session ||= {};
  return next();
});

/* =========================
   ESTADOS
========================= */

const STATE = {
  IDLE: "idle",
  WAIT_GPS: "wait_gps",
  WAIT_DESC: "wait_desc",
  IA: "ia",
  CONFIRM: "confirm"
};

/* =========================
   UTIL
========================= */

function menu() {
  return Markup.keyboard([
    ["📍 Reportar"],
    ["🗺 Mapa"],
    ["🤖 Aifucito"],
    ["👤 Perfil"]
  ]).resize();
}

function rango(user = {}) {
  if (String(user?.id) === String(ADMIN_ID))
    return "👑 Comandante Intergaláctico";

  const r = user?.reportes || 0;

  if (r >= 20) return "CRIDOVNI";
  if (r >= 10) return "Guardaespaldas OVNI";
  if (r >= 5) return "Cebador cósmico";
  return "Observador inicial";
}

/* =========================
   GEO
========================= */

async function reverseGeo(lat, lng) {
  try {
    const r = await axios.get(
      "https://nominatim.openstreetmap.org/reverse",
      {
        params: { format: "json", lat, lon: lng },
        headers: { "User-Agent": "AIFUCITO" },
        timeout: 8000
      }
    );

    const a = r.data?.address || {};

    return {
      pais: a.country_code?.toUpperCase() || "GLOBAL",
      ciudad: a.city || a.town || a.village || "Desconocido",
      localidad: a.suburb || a.neighbourhood || "Desconocido"
    };
  } catch {
    return { pais: "GLOBAL", ciudad: "N/A", localidad: "N/A" };
  }
}

/* =========================
   SUPABASE USER
========================= */

async function ensureUser(ctx) {
  const id = String(ctx.from.id);

  const { data } = await supabase
    .from("usuarios")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (data) return data;

  const user = {
    id,
    nombre: ctx.from.username || ctx.from.first_name,
    reportes: 0,
    rol: id === String(ADMIN_ID) ? "admin" : "user"
  };

  await supabase.from("usuarios").insert([user]);

  return user;
}

/* =========================
   GEMINI
========================= */

async function gemini(text) {
  try {
    const r = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent",
      {
        contents: [{ parts: [{ text }] }]
      },
      { params: { key: GEMINI_KEY }, timeout: 10000 }
    );

    return r.data?.candidates?.[0]?.content?.parts?.[0]?.text || "sin respuesta";
  } catch {
    return "error IA";
  }
}

/* =========================
   GUARDAR
========================= */

async function save(report) {
  await supabase.from("reportes").insert([report]);
}

/* =========================
   ALERTA
========================= */

async function alert(pais, msg) {
  const channels = [CHANNEL_CONO_SUR];

  if (pais === "UY") channels.push(CHANNEL_UY);
  else if (pais === "AR") channels.push(CHANNEL_AR);
  else if (pais === "CL") channels.push(CHANNEL_CL);
  else channels.push(CHANNEL_GLOBAL);

  for (const c of channels) {
    if (!c) continue;
    await bot.telegram.sendMessage(c, "🚨 AIFU\n\n" + msg).catch(() => {});
  }
}

/* =========================
   START
========================= */

bot.start(async (ctx) => {
  await ensureUser(ctx);
  ctx.session.state = STATE.IDLE;
  ctx.reply("Sistema activo", menu());
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
`Perfil:
Nombre: ${data?.nombre}
Reportes: ${data?.reportes}
Rango: ${rango(data)}`
  );
});

/* =========================
   MAPA
========================= */

bot.hears("🗺 Mapa", (ctx) => {
  ctx.reply("Mapa activo", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Abrir", url: "https://aifucito5-0.onrender.com" }]
      ]
    }
  });
});

/* =========================
   REPORTAR (GPS OBLIGATORIO)
========================= */

bot.hears("📍 Reportar", (ctx) => {
  ctx.session.state = STATE.WAIT_GPS;

  ctx.reply("OBLIGATORIO: envía ubicación GPS", {
    reply_markup: {
      keyboard: [[{ text: "📡 Enviar GPS", request_location: true }]],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  });
});

/* =========================
   LOCATION ONLY
========================= */

bot.on("location", (ctx) => {
  if (ctx.session.state !== STATE.WAIT_GPS) return;

  ctx.session.lat = ctx.message.location.latitude;
  ctx.session.lng = ctx.message.location.longitude;
  ctx.session.state = STATE.WAIT_DESC;

  ctx.reply("Describe el evento (mínimo 20 caracteres)");
});

/* =========================
   TEXT FLOW
========================= */

bot.on("text", async (ctx) => {
  const text = ctx.message.text;

  if (ctx.session.state === STATE.IA) {
    const r = await gemini(text);
    ctx.reply(r);
    ctx.session.state = STATE.IDLE;
    return;
  }

  if (ctx.session.state === STATE.WAIT_DESC) {

    if (text.length < 20)
      return ctx.reply("Mínimo 20 caracteres");

    const geo = await reverseGeo(ctx.session.lat, ctx.session.lng);

    ctx.session.pending = {
      lat: ctx.session.lat,
      lng: ctx.session.lng,
      descripcion: text,
      pais: geo.pais,
      ciudad: geo.ciudad,
      localidad: geo.localidad
    };

    ctx.session.state = STATE.CONFIRM;

    return ctx.reply(
`CONFIRMAR:

País: ${geo.pais}
Ciudad: ${geo.ciudad}
Localidad: ${geo.localidad}

Texto:
${text}`,
{
  reply_markup: {
    inline_keyboard: [
      [{ text: "✔ Confirmar", callback_data: "ok" }],
      [{ text: "✖ Cancelar", callback_data: "no" }]
    ]
  }
}
    );
  }

  if (ctx.session.state === STATE.IDLE) {
    return;
  }
});

/* =========================
   CONFIRM
========================= */

bot.action("ok", async (ctx) => {
  const r = ctx.session.pending;
  if (!r) return;

  await save(r);

  await alert(r.pais, `
${r.pais} - ${r.ciudad}
Evento registrado
`);

  ctx.session = {};
  ctx.reply("Guardado");
});

/* =========================
   CANCEL
========================= */

bot.action("no", (ctx) => {
  ctx.session = {};
  ctx.reply("Cancelado");
});

/* =========================
   IA
========================= */

bot.hears("🤖 Aifucito", (ctx) => {
  ctx.session.state = STATE.IA;
  ctx.reply("Escribe consulta");
});

/* =========================
   LAUNCH
========================= */

bot.launch();
console.log("AIFUCITO OPERATIVO");
