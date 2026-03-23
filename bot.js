import "dotenv/config";
import { Telegraf, session, Markup } from "telegraf";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import express from "express";

/* ================= CONFIG ================= */

const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const GROUPS = {
  CONO_SUR: process.env.GROUP_CONO_SUR,
  UY: process.env.GROUP_UY,
  AR: process.env.GROUP_AR,
  CL: process.env.GROUP_CL,
  GLOBAL: process.env.GROUP_GLOBAL,
  ALERTS: process.env.GROUP_ALERTS
};

/* ================= WEB SERVER ================= */

const app = express();
app.use(express.static("public"));

app.get("/", (_, res) => res.send("AIFU ONLINE"));
app.get("/health", (_, res) => res.send("OK"));

/* ================= MEMORY ================= */

const memory = new Map();

async function getProfile(id) {
  if (memory.has(id)) return memory.get(id);

  let { data } = await supabase
    .from("sessions")
    .select("*")
    .eq("user_id", id)
    .maybeSingle();

  if (!data) {
    data = {
      user_id: id,
      state: "IDLE",
      role: "free",
      lat: null,
      lng: null
    };

    await supabase.from("sessions").upsert(data);
  }

  memory.set(id, data);
  return data;
}

async function updateProfile(id, payload) {
  const current = await getProfile(id);
  const updated = { ...current, ...payload };

  memory.set(id, updated);

  return supabase
    .from("sessions")
    .update(payload)
    .eq("user_id", id);
}

/* ================= GPS GEO ================= */

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
    return { city: "Desconocido", country: "Desconocido", countryCode: "XX" };
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

    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || "sin respuesta";
  } catch {
    return "interferencia IA";
  }
}

/* ================= EVENT CLASSIFIER ================= */

async function classifyEvent(text) {
  const res = await IA(`
Clasifica en: luz / nave / anomalía / desconocido

Texto:
${text}
`);
  return res.toLowerCase().trim();
}

/* ================= FORMAT REPORT ================= */

function formatReport(user, location, type, desc, lat, lng) {
  return `
🛸 REPORTE AIFU RADAR
────────────────────
👤 Usuario: ${user}
🌍 Ubicación: ${location.city}, ${location.country}
📡 Tipo: ${type}
📅 Fecha: ${new Date().toLocaleString()}
📍 GPS: ${lat}, ${lng}

🧠 Descripción:
${desc}
────────────────────
ID: ${uuidv4()}
`;
}

/* ================= SOCIAL GROUP ROUTER ================= */

function getSocialGroup(code) {
  if (code === "UY") return GROUPS.UY;
  if (code === "AR") return GROUPS.AR;
  if (code === "CL") return GROUPS.CL;
  return GROUPS.GLOBAL;
}

/* ================= VIP FILTER MAP ================= */

function filterReports(reports, user) {
  if (user.role === "vip" || user.role === "collaborator") {
    return reports;
  }

  return reports.filter(() => Math.random() < 0.4);
}

/* ================= ALERT SYSTEM ================= */

async function sendVIPAlert(user, report) {
  if (user.role === "vip" || user.role === "collaborator") {
    await bot.telegram.sendMessage(GROUPS.ALERTS, "🚨 ALERTA AIFU\n\n" + report);
  }
}

/* ================= BOT INIT ================= */

bot.use(session());

bot.start(async (ctx) => {
  await getProfile(String(ctx.from.id));
  ctx.reply("🛸 AIFU activo");
});

/* ================= MENU ================= */

bot.hears("🗺 Mapa", (ctx) => {
  ctx.reply("Mapa en vivo:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🌍 Abrir mapa", url: process.env.BASE_URL }]
      ]
    }
  });
});

bot.hears("📍 Reportar", (ctx) => {
  ctx.reply("Envía tu ubicación primero:");
});

/* ================= LOCATION ================= */

bot.on("location", async (ctx) => {
  const id = String(ctx.from.id);

  await updateProfile(id, {
    state: "WAIT_DESC",
    lat: ctx.message.location.latitude,
    lng: ctx.message.location.longitude
  });

  ctx.reply("Describe lo observado:");
});

/* ================= MAIN FLOW ================= */

bot.on("text", async (ctx) => {
  const id = String(ctx.from.id);
  const text = ctx.message.text;
  const user = await getProfile(id);

  if (user.state === "WAIT_DESC") {
    const location = await getLocation(user.lat, user.lng);

    const type = await classifyEvent(text);

    const expanded = await IA(`
Mejora este reporte sin inventar datos:

${text}
`);

    const report = formatReport(id, location, type, expanded, user.lat, user.lng);

    /* guardar fenómenos (memoria global) */
    await supabase.from("phenomena_memory").insert({
      id: uuidv4(),
      city: location.city,
      country: location.country,
      type,
      description: expanded,
      lat: user.lat,
      lng: user.lng
    });

    /* guardar reporte */
    await supabase.from("reportes").insert({
      id: uuidv4(),
      user_id: id,
      city: location.city,
      country: location.country,
      type,
      description: expanded,
      lat: user.lat,
      lng: user.lng
    });

    /* radar cono sur */
    await bot.telegram.sendMessage(GROUPS.CONO_SUR, report);

    /* grupo social */
    const social = getSocialGroup(location.countryCode);
    await bot.telegram.sendMessage(social, `👤 Nuevo reporte desde ${location.city}, ${location.country}`);

    /* alerta VIP */
    await sendVIPAlert(user, report);

    await updateProfile(id, { state: "IDLE" });

    return ctx.reply("Reporte enviado correctamente.");
  }

  if (user.state === "IA") {
    const res = await IA(text);
    return ctx.reply(res);
  }
});

/* ================= MAP API (VIP FILTER) ================= */

app.get("/api/reports", async (req, res) => {
  const userId = req.query.user;

  const user = await getProfile(userId);

  const { data } = await supabase
    .from("reportes")
    .select("*")
    .order("created_at", { ascending: false });

  const filtered = filterReports(data || [], user);

  res.json(filtered);
});

/* ================= RUN ================= */

const PORT = process.env.PORT || 10000;

app.listen(PORT, "0.0.0.0", async () => {
  await bot.launch();
});
