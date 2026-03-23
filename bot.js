import "dotenv/config";
import { Telegraf, session, Markup } from "telegraf";
import { createClient } from "@supabase/supabase-js";
import axios from "axios";
import express from "express";
import { v4 as uuidv4 } from "uuid";

/* ==========================================
   🔒 INSTANCE LOCK
========================================== */
if (global.__AIFU_RUNNING__) process.exit(0);
global.__AIFU_RUNNING__ = true;

/* ==========================================
   CORE
========================================== */
const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

/* ==========================================
   EXPRESS
========================================== */
const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 10000;

/* ==========================================
   HEALTH (RENDER REQUIRED)
========================================== */
app.get("/", (req, res) => res.status(200).send("AIFU ONLINE"));
app.get("/health", (req, res) => res.status(200).send("OK"));

/* ==========================================
   REAL TIME STREAM (RADAR LIVE)
========================================== */
const clients = [];

app.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  clients.push(res);

  req.on("close", () => {
    const i = clients.indexOf(res);
    if (i >= 0) clients.splice(i, 1);
  });
});

async function pushRealtime(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach(c => c.write(msg));
}

/* ==========================================
   SUPABASE (NO CACHE - FULL PERSISTENT)
========================================== */

async function getUser(id) {
  const { data } = await supabase
    .from("sessions")
    .select("*")
    .eq("user_id", id)
    .maybeSingle();

  if (!data) {
    const newUser = {
      user_id: id,
      state: "IDLE",
      reports_count: 0,
      is_vip: false,
      sub_expires: null,
      lat: null,
      lng: null
    };

    await supabase.from("sessions").insert(newUser);
    return newUser;
  }

  return data;
}

async function updateUser(id, patch) {
  await supabase.from("sessions").update(patch).eq("user_id", id);
  return getUser(id);
}

/* ==========================================
   PREMIUM CHECK
========================================== */
const isPremium = (u) =>
  u.is_vip || (u.sub_expires && new Date(u.sub_expires) > new Date());

/* ==========================================
   IA (GEMINI)
========================================== */
async function IA(text) {
  try {
    const r = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text }] }]
      }
    );

    return r.data?.candidates?.[0]?.content?.parts?.[0]?.text || "Sin señal";
  } catch {
    return "IA fuera de línea";
  }
}

/* ==========================================
   MENU
========================================== */
bot.use(session());

const menu = Markup.keyboard([
  ["📍 Reporte", "🛰 Radar"],
  ["👤 Perfil", "🤖 IA"],
  ["💳 Premium", "❌ Cancelar"]
]).resize();

/* ==========================================
   START
========================================== */
bot.start(async (ctx) => {
  await getUser(String(ctx.from.id));
  return ctx.reply("Bienvenido, agente.", menu);
});

/* ==========================================
   IA MODE
========================================== */
bot.hears("🤖 IA", async (ctx) => {
  await updateUser(String(ctx.from.id), { state: "IA" });
  ctx.reply("IA activada");
});

/* ==========================================
   REPORT FLOW
========================================== */
bot.hears("📍 Reporte", async (ctx) => {
  await updateUser(String(ctx.from.id), { state: "WAIT_LOCATION" });

  return ctx.reply(
    "Envía ubicación",
    Markup.keyboard([[Markup.button.locationRequest("📍 GPS")], ["❌ Cancelar"]]).resize()
  );
});

bot.on("location", async (ctx) => {
  const id = String(ctx.from.id);
  const user = await getUser(id);

  if (user.state !== "WAIT_LOCATION") return;

  await updateUser(id, {
    state: "WAIT_DESC",
    lat: ctx.message.location.latitude,
    lng: ctx.message.location.longitude
  });

  return ctx.reply("Describe el evento", Markup.removeKeyboard());
});

/* ==========================================
   TEXT HANDLER (IA + REPORTS)
========================================== */
bot.on("text", async (ctx) => {
  const id = String(ctx.from.id);
  const user = await getUser(id);
  const text = ctx.message.text;

  /* IA MODE */
  if (user.state === "IA") {
    return ctx.reply(await IA(text));
  }

  /* REPORT */
  if (user.state === "WAIT_DESC") {
    const report = {
      id: uuidv4(),
      user_id: id,
      descripcion: text,
      lat: user.lat,
      lng: user.lng,
      created_at: new Date().toISOString()
    };

    await supabase.from("reportes").insert(report);

    const updated = await updateUser(id, {
      state: "IDLE",
      reports_count: (user.reports_count || 0) + 1
    });

    /* REAL TIME PUSH */
    await pushRealtime(report);

    /* TELEGRAM CHANNEL */
    await bot.telegram.sendMessage(
      process.env.CHANNEL_CONOSUR,
      `🚨 REPORTE\n${text}\n📍 ${user.lat},${user.lng}`
    );

    return ctx.reply("Reporte enviado", menu);
  }
});

/* ==========================================
   RADAR (REAL TIME FRONTEND)
========================================== */
bot.hears("🛰 Radar", async (ctx) => {
  const url = `${process.env.PUBLIC_URL}/index.html?user_id=${ctx.from.id}`;
  return ctx.reply("Radar activo", {
    reply_markup: {
      inline_keyboard: [[{ text: "Abrir mapa", url }]]
    }
  });
});

/* ==========================================
   PROFILE
========================================== */
bot.hears("👤 Perfil", async (ctx) => {
  const u = await getUser(String(ctx.from.id));

  return ctx.reply(
    `Reportes: ${u.reports_count}\nEstado: ${isPremium(u) ? "PREMIUM" : "FREE"}`
  );
});

/* ==========================================
   PREMIUM
========================================== */
bot.hears("💳 Premium", (ctx) => {
  ctx.reply("Acceso premium en desarrollo");
});

bot.hears("❌ Cancelar", async (ctx) => {
  await updateUser(String(ctx.from.id), { state: "IDLE" });
  ctx.reply("Cancelado", menu);
});

/* ==========================================
   AUTO RESTART (WATCHDOG)
========================================== */
setInterval(() => {
  fetch(`http://localhost:${PORT}/health`).catch(() => {
    console.log("Watchdog detectó caída lógica");
    process.exit(1);
  });
}, 300000);

/* ==========================================
   START SYSTEM (RENDER SAFE ORDER)
========================================== */
async function start() {
  try {
    /* 1. EXPRESS FIRST (CRITICAL FOR RENDER) */
    app.listen(PORT, "0.0.0.0", () => {
      console.log("HTTP READY", PORT);
    });

    /* 2. BOT SECOND */
    await bot.launch({ dropPendingUpdates: true });
    console.log("BOT ONLINE");

  } catch (e) {
    console.error("FATAL:", e);
    process.exit(1);
  }
}

start();

/* ==========================================
   CLEAN EXIT
========================================== */
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
