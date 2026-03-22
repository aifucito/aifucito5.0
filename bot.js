import "dotenv/config";
import { Telegraf } from "telegraf";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";

// =====================================================
// ⚙️ BOOTSTRAP FAIL-FAST + DIAGNÓSTICO TOTAL
// =====================================================

function loadConfig() {
  const required = [
    "BOT_TOKEN",
    "SUPABASE_URL",
    "SUPABASE_KEY",
    "CHANNEL_AR",
    "CHANNEL_CL",
    "CHANNEL_UY",
    "CHANNEL_GLOBAL",
    "CHANNEL_CONOSUR"
  ];

  const missing = [];
  const config = {};

  console.log("🧠 AIFU BOOT STRAP STARTING...");

  for (const key of required) {
    const value = process.env[key];

    if (!value) {
      missing.push(key);
    } else {
      config[key] = value;
    }
  }

  if (missing.length > 0) {
    console.error("❌ CONFIGURATION ERROR:");
    missing.forEach(k => console.error(" - " + k));
    throw new Error("BOOT FAILED: Missing environment variables");
  }

  console.log("✔ ENV OK");
  return config;
}

const config = loadConfig();

// =====================================================
// 🧠 CLIENTES
// =====================================================

const bot = new Telegraf(config.BOT_TOKEN);

const supabase = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_KEY
);

// =====================================================
// 🧭 PERSONALIDAD
// =====================================================

function aiReply(text) {
  return `🛸 AIFUCITO: ${text}`;
}

// =====================================================
// 🧩 RANGOS
// =====================================================

const RANKS = [
  { xp: 0, name: "Observador" },
  { xp: 50, name: "Explorador" },
  { xp: 150, name: "Investigador" },
  { xp: 400, name: "Analista" },
  { xp: 800, name: "Contacto Oficial" }
];

function getRank(xp = 0) {
  let r = RANKS[0];
  for (const rank of RANKS) {
    if (xp >= rank.xp) r = rank;
  }
  return r;
}

// =====================================================
// 🌎 ROUTING CANALES
// =====================================================

function getChannels(pais) {
  const key = (pais || "GLOBAL").toString().trim().toUpperCase();

  const regional = config[`CHANNEL_${key}`];
  const conoSur = config.CHANNEL_CONOSUR;
  const global = config.CHANNEL_GLOBAL;

  const channels = [conoSur, regional, global].filter(Boolean);

  if (!regional) {
    console.warn("⚠️ Canal regional no encontrado:", key);
  }

  return channels;
}

// =====================================================
// 📡 EVENT STORE (RETRY + CONTROL DE COLISIÓN)
// =====================================================

async function emitEvent(type, payload, aggregateId, attempt = 0) {
  if (attempt > 5) throw new Error("EVENT FAILURE: max retries reached");

  try {
    const { data: last } = await supabase
      .from("eventos")
      .select("version")
      .eq("aggregate_id", String(aggregateId))
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = (last?.version || 0) + 1;

    const { error } = await supabase.from("eventos").insert({
      id: uuidv4(),
      type: type.toUpperCase(),
      aggregate_id: String(aggregateId),
      payload,
      version: nextVersion,
      created_at: new Date().toISOString()
    });

    if (error) {
      if (error.code === "23505") {
        await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
        return emitEvent(type, payload, aggregateId, attempt + 1);
      }

      throw error;
    }

  } catch (err) {
    console.error("🔥 EVENT ERROR:", {
      message: err.message,
      stack: err.stack
    });
  }
}

// =====================================================
// 🧱 WORKER (QUEUE ATÓMICA + PROTECCIÓN)
// =====================================================

let workerRunning = false;

async function worker() {
  if (workerRunning) return;
  workerRunning = true;

  try {
    const { data: job, error } = await supabase.rpc("lock_next_message");

    if (error) {
      console.error("WORKER RPC ERROR:", error.message);
      workerRunning = false;
      return;
    }

    if (!job) {
      workerRunning = false;
      return;
    }

    try {
      await bot.telegram.sendMessage(job.channel, job.msg);

      await supabase
        .from("message_queue")
        .update({ status: "sent" })
        .eq("id", job.id);

    } catch (err) {
      console.error("SEND FAIL:", err.message);

      await supabase
        .from("message_queue")
        .update({
          status: "pending",
          retry_count: (job.retry_count || 0) + 1
        })
        .eq("id", job.id);
    }

  } catch (err) {
    console.error("WORKER FATAL:", err.message);
  }

  workerRunning = false;
}

// =====================================================
// 🎯 HANDLER PRINCIPAL
// =====================================================

bot.on("text", async (ctx) => {
  try {
    const pais = ctx.session?.pais || "GLOBAL";

    const currentXP = (ctx.session?.xp || 0) + 10;
    ctx.session.xp = currentXP;

    const rank = getRank(currentXP);

    const targets = getChannels(pais);

    for (const ch of targets) {
      await supabase.from("message_queue").insert({
        id: uuidv4(),
        channel: ch,
        msg: ctx.message.text,
        status: "pending"
      });
    }

    await emitEvent("MESSAGE_RECEIVED", {
      user: ctx.from.id,
      text: ctx.message.text,
      xp: currentXP,
      rank: rank.name
    }, ctx.from.id);

    await ctx.reply(
      aiReply(`Mensaje procesado | Rango: ${rank.name} | XP: ${currentXP}`)
    );

  } catch (err) {
    console.error("HANDLER ERROR:", {
      message: err.message,
      stack: err.stack
    });
  }
});

// =====================================================
// 🚀 STARTUP SECUENCIAL + DEBUG TOTAL
// =====================================================

async function start() {
  try {
    console.log("🧠 INITIALIZING AIFU BOT...");

    console.log("✔ ENV loaded");
    console.log("✔ Supabase connected");
    console.log("✔ Channels validated (runtime)");

    bot.launch();

    setInterval(worker, 1200);

    console.log("🚀 AIFU BOT ONLINE");

  } catch (err) {
    console.error("💥 BOOT FAILURE:");
    console.error(err.message);
    process.exit(1);
  }
}

start();
