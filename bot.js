import "dotenv/config";
import { Telegraf, session, Markup } from "telegraf";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import express from "express";

/* ================= CONFIG ================= */

const bot = new Telegraf(process.env.BOT_TOKEN);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const GROUPS = {
  CONO_SUR: process.env.GROUP_CONO_SUR, // RADAR SOLO REPORTES
  UY: process.env.GROUP_UY,
  AR: process.env.GROUP_AR,
  CL: process.env.GROUP_CL,
  GLOBAL: process.env.GROUP_GLOBAL
};

/* ================= SERVER ================= */

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

  await supabase
    .from("sessions")
    .update(payload)
    .eq("user_id", id);

  return updated;
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

    return (
      res.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "sin respuesta"
    );
  } catch {
    return "interferencia IA";
  }
}

/* ================= CLASSIFIER ================= */

async function classifyEvent(text) {
  const res = await IA(`
Clasifica SOLO en: luz / nave / anomalía / desconocido

Texto:
${text}
`);

  return res.toLowerCase().trim();
}

/* ================= REPORT ================= */

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

/* ================= GROUP ROUTING ================= */

function getChatGroup(code) {
  if (code === "UY") return GROUPS.UY;
  if (code === "AR") return GROUPS.AR;
  if (code === "CL") return GROUPS.CL;
  return GROUPS.GLOBAL;
}

/* ================= FILTER MAP ================= */

function filterReports(reports, user) {
  if (user.role === "vip" || user.role === "collaborator") {
    return reports;
  }

  return reports.filter(() => Math.random() < 0.4);
}

/* ================= UI MENU ================= */

const menu = Markup.keyboard([
  ["📍 Nuevo Reporte"],
  ["🗺 Mapa", "💬 Comunidad"],
  ["👤 Mi Perfil"]
]).resize();

/* ================= START ================= */

bot.use(session());

bot.start(async (ctx) => {
  await getProfile(String(ctx.from.id));

  return ctx.reply(
    "🛸 AIFU RADAR ONLINE\nSelecciona una opción:",
    menu
  );
});

/* ================= BUTTONS ================= */

bot.hears("📍 Nuevo Reporte", async (ctx) => {
  await updateProfile(String(ctx.from.id), {
    state: "WAIT_LOCATION"
  });

  return ctx.reply(
    "📡 Envíe su ubicación GPS",
    Markup.keyboard([
      [Markup.button.locationRequest("📍 Enviar GPS")]
    ]).resize().oneTime()
  );
});

bot.hears("🗺 Mapa", (ctx) => {
  return ctx.reply("🌍 Radar en vivo:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Abrir mapa", url: process.env.BASE_URL }]
      ]
    }
  });
});

bot.hears("💬 Comunidad", (ctx) => {
  return ctx.reply("💬 Grupos disponibles:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🇺🇾 Uruguay", url: process.env.GROUP_UY }],
        [{ text: "🇦🇷 Argentina", url: process.env.GROUP_AR }],
        [{ text: "🇨🇱 Chile", url: process.env.GROUP_CL }],
        [{ text: "🌍 Global", url: process.env.GROUP_GLOBAL }]
      ]
    }
  });
});

bot.hears("👤 Mi Perfil", async (ctx) => {
  const user = await getProfile(String(ctx.from.id));

  return ctx.reply(
    `👤 PERFIL AIFU
Estado: ${user.state}
Rol: ${user.role}
GPS: ${user.lat || "-"} / ${user.lng || "-"}`
  );
});

/* ================= LOCATION ================= */

bot.on("location", async (ctx) => {
  const id = String(ctx.from.id);
  const user = await getProfile(id);

  if (user.state !== "WAIT_LOCATION") {
    return ctx.reply("⚠️ Inicie primero un reporte");
  }

  await updateProfile(id, {
    state: "WAIT_DESC",
    lat: ctx.message.location.latitude,
    lng: ctx.message.location.longitude
  });

  return ctx.reply("🧠 Describa lo que observó");
});

/* ================= TEXT FLOW ================= */

bot.on("text", async (ctx) => {
  const id = String(ctx.from.id);
  const text = ctx.message.text;
  const user = await getProfile(id);

  if (user.state !== "WAIT_DESC") return;

  const location = await getLocation(user.lat, user.lng);
  const type = await classifyEvent(text);
  const expanded = await IA(`Mejora sin inventar datos:\n${text}`);

  const report = formatReport(
    id,
    location,
    type,
    expanded,
    user.lat,
    user.lng
  );

  /* RADAR SOLO */
  await bot.telegram.sendMessage(GROUPS.CONO_SUR, report);

  /* CHAT SOCIAL */
  const chatGroup = getChatGroup(location.countryCode);

  await bot.telegram.sendMessage(
    chatGroup,
    `📡 Nuevo reporte desde ${location.city}`
  );

  /* SAVE DB */
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

  await updateProfile(id, { state: "IDLE" });

  return ctx.reply("✅ Reporte enviado al radar AIFU", menu);
});

/* ================= MAP API ================= */

app.get("/api/reports", async (_, res) => {
  const { data } = await supabase
    .from("reportes")
    .select("*")
    .order("created_at", { ascending: false });

  res.json(data || []);
});

/* ================= RUN ================= */

const PORT = process.env.PORT || 10000;

app.listen(PORT, "0.0.0.0", async () => {
  await bot.launch();
  console.log("🛸 AIFU BOT ONLINE");
});
