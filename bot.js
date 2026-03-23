import "dotenv/config";
import { Telegraf, session, Markup } from "telegraf";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import express from "express";

/* ================= SAFE SINGLE INSTANCE ================= */

if (global.__AIFU_RUNNING__) {
  console.log("⚠️ Instancia duplicada bloqueada");
  process.exit(0);
}
global.__AIFU_RUNNING__ = true;

/* ================= CORE INIT ================= */

const bot = new Telegraf(process.env.BOT_TOKEN);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

/* ================= GROUPS ================= */

const GROUPS = {
  CONO_SUR: process.env.GROUP_CONO_SUR, // RADAR
  UY: process.env.GROUP_UY,
  AR: process.env.GROUP_AR,
  CL: process.env.GROUP_CL,
  GLOBAL: process.env.GROUP_GLOBAL
};

/* ================= EXPRESS ================= */

const app = express();
app.use(express.static("public"));

app.get("/", (_, res) => res.send("AIFU ONLINE"));
app.get("/health", (_, res) => res.send("OK"));

/* ================= CACHE ================= */

const cache = {
  reports: null,
  timestamp: 0
};

const CACHE_MS = 15000;

/* ================= MEMORY ================= */

const memory = new Map();

async function getProfile(id) {
  if (memory.has(id)) return memory.get(id);

  const { data } = await supabase
    .from("sessions")
    .select("*")
    .eq("user_id", id)
    .maybeSingle();

  const profile =
    data || {
      user_id: id,
      state: "IDLE",
      role: "free",
      lat: null,
      lng: null
    };

  await supabase.from("sessions").upsert(profile);
  memory.set(id, profile);

  return profile;
}

async function updateProfile(id, patch) {
  const current = await getProfile(id);
  const updated = { ...current, ...patch };

  memory.set(id, updated);

  await supabase.from("sessions").update(patch).eq("user_id", id);

  return updated;
}

/* ================= SAFE SEND ================= */

async function safeSend(chatId, msg) {
  try {
    if (!chatId) return;
    await bot.telegram.sendMessage(chatId, msg);
  } catch (e) {
    console.log("⚠️ Telegram error:", e.message);
  }
}

/* ================= GEO ================= */

async function getLocation(lat, lng) {
  try {
    const res = await axios.get(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=es`
    );

    return {
      city: res.data.city || res.data.locality || "Desconocido",
      country: res.data.countryName || "Desconocido",
      countryCode: res.data.countryCode || "XX"
    };
  } catch {
    return {
      city: "Desconocido",
      country: "Desconocido",
      countryCode: "XX"
    };
  }
}

/* ================= IA ================= */

async function IA(prompt) {
  try {
    const res = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
      { contents: [{ parts: [{ text: prompt }] }] },
      { headers: { "X-goog-api-key": process.env.GEMINI_API_KEY } }
    );

    return (
      res.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "sin respuesta IA"
    );
  } catch {
    return "IA OFFLINE";
  }
}

/* ================= CLASSIFIER ================= */

async function classifyEvent(text) {
  const r = await IA(`Clasifica: luz / nave / anomalía / desconocido\n${text}`);
  return r.toLowerCase().trim();
}

/* ================= REPORT FORMAT ================= */

function formatReport(user, loc, type, desc, lat, lng) {
  return `
🛸 AIFU RADAR
──────────────────
👤 Usuario: ${user}
🌍 Ubicación: ${loc.city}, ${loc.country}
📡 Tipo: ${type}
📍 GPS: ${lat}, ${lng}
📅 ${new Date().toLocaleString()}
──────────────────
🧠 ${desc}
ID: ${uuidv4()}
`;
}

/* ================= GROUP ROUTING ================= */

function getChatGroup(code) {
  if (code === "UY") return GROUPS.UY;
  if (code === "AR") return GROUPS.AR;
  if (code === "CL") return GROUPS.CL;
  return GROUPS.GLOBAL;
}

/* ================= ROLE ACCESS ================= */

function getAccessRole(user) {
  if (user?.role === "vip") return "vip";
  if (user?.role === "collaborator") return "vip";
  return "free";
}

/* ================= BOOT CHECK ================= */

async function bootCheck() {
  try {
    const ok =
      !!process.env.BOT_TOKEN &&
      !!process.env.SUPABASE_URL &&
      !!process.env.SUPABASE_KEY;

    if (!ok) throw new Error("ENV missing");

    console.log("🟢 SYSTEM OK");
  } catch (e) {
    console.log("🔴 BOOT FAIL:", e.message);
    process.exit(1);
  }
}

/* ================= BOT ================= */

bot.use(session());

const menu = Markup.keyboard([
  ["📍 Nuevo Reporte"],
  ["🗺 Mapa", "💬 Comunidad"],
  ["👤 Mi Perfil"]
]).resize();

/* ================= START ================= */

bot.start(async (ctx) => {
  await getProfile(String(ctx.from.id));

  return ctx.reply("Bienvenido, agente", menu);
});

/* ================= FLOW ================= */

bot.hears("📍 Nuevo Reporte", async (ctx) => {
  await updateProfile(String(ctx.from.id), {
    state: "WAIT_LOCATION"
  });

  return ctx.reply(
    "📡 Enviar ubicación GPS",
    Markup.keyboard([
      [Markup.button.locationRequest("📍 Enviar GPS")]
    ])
      .resize()
      .oneTime()
  );
});

/* ================= LOCATION ================= */

bot.on("location", async (ctx) => {
  const id = String(ctx.from.id);
  const user = await getProfile(id);

  if (user.state !== "WAIT_LOCATION") return;

  await updateProfile(id, {
    state: "WAIT_DESC",
    lat: ctx.message.location.latitude,
    lng: ctx.message.location.longitude
  });

  return ctx.reply("🧠 Describe lo observado");
});

/* ================= TEXT FLOW ================= */

bot.on("text", async (ctx) => {
  const id = String(ctx.from.id);
  const user = await getProfile(id);

  if (user.state !== "WAIT_DESC") return;

  const loc = await getLocation(user.lat, user.lng);
  const type = await classifyEvent(ctx.message.text);
  const desc = await IA(ctx.message.text);

  const report = formatReport(
    id,
    loc,
    type,
    desc,
    user.lat,
    user.lng
  );

  await safeSend(GROUPS.CONO_SUR, report);
  await safeSend(getChatGroup(loc.countryCode), "📡 Nuevo reporte");

  await supabase.from("reportes").insert({
    id: uuidv4(),
    user_id: id,
    city: loc.city,
    country: loc.country,
    type,
    description: desc,
    lat: user.lat,
    lng: user.lng,
    created_at: new Date().toISOString()
  });

  await updateProfile(id, { state: "IDLE" });

  return ctx.reply("✅ Reporte enviado", menu);
});

/* ================= MAP API ================= */

app.get("/api/reports", async (req, res) => {
  try {
    const role = req.query.role || "free";

    const now = Date.now();

    if (role === "free" && cache.reports && now - cache.timestamp < CACHE_MS) {
      return res.json(cache.reports);
    }

    const cutoff =
      role === "free"
        ? new Date(Date.now() - 16 * 60 * 60 * 1000)
        : null;

    let query = supabase
      .from("reportes")
      .select("*")
      .order("created_at", { ascending: false });

    if (cutoff) {
      query = query.gte("created_at", cutoff.toISOString());
    }

    const { data } = await query;

    if (role === "free") {
      cache.reports = data || [];
      cache.timestamp = now;
    }

    res.json(data || []);
  } catch (e) {
    res.json([]);
  }
});

/* ================= COMMUNITY ================= */

bot.hears("💬 Comunidad", (ctx) => {
  return ctx.reply("💬 Grupos activos:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Uruguay", url: process.env.GROUP_UY }],
        [{ text: "Argentina", url: process.env.GROUP_AR }],
        [{ text: "Chile", url: process.env.GROUP_CL }],
        [{ text: "Global", url: process.env.GROUP_GLOBAL }]
      ]
    }
  });
});

/* ================= MAP ================= */

bot.hears("🗺 Mapa", async (ctx) => {
  const user = await getProfile(String(ctx.from.id));
  const role = getAccessRole(user);

  const url = `${process.env.BASE_URL}/public/index.html?role=${role}`;

  return ctx.reply("🌍 Radar activo", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Abrir mapa", url }]
      ]
    }
  });
});

/* ================= PROFILE ================= */

bot.hears("👤 Mi Perfil", async (ctx) => {
  const u = await getProfile(String(ctx.from.id));

  return ctx.reply(
    `👤 PERFIL
Rol: ${u.role}
Estado: ${u.state}`
  );
});

/* ================= ERROR HANDLING ================= */

bot.catch((err) => {
  console.log("⚠️ BOT ERROR:", err);
});

/* ================= START SYSTEM ================= */

async function start() {
  await bootCheck();

  app.listen(process.env.PORT || 10000, "0.0.0.0", () => {
    console.log("🌐 WEB OK");
  });

  await bot.launch();

  console.log("🛸 AIFU ONLINE");
}

start();
