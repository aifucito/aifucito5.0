import "dotenv/config";
import { Telegraf, session, Markup } from "telegraf";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import express from "express";

/* ================= CONFIG ================= */
const OWNER_ID = "7662736311";
const PAYPAL_LINK = "https://www.paypal.com/paypalme/electros/3";

const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

/* ================= WEB ================= */
const app = express();
app.get("/", (_, res) => res.send("AIFU ONLINE"));
app.get("/health", (_, res) => res.send("OK"));

/* ================= MEMORIA ================= */
const memory = new Map();

async function getProfile(id) {
  if (memory.has(id)) return memory.get(id);

  let { data } = await supabase.from("sessions").select("*").eq("user_id", id).maybeSingle();

  if (!data) {
    data = {
      user_id: id,
      state: "IDLE",
      xp: 0,
      ai_count: 0,
      role: "free",
      premium_until: null
    };
    await supabase.from("sessions").upsert(data);
  }

  // expiración automática
  if (data.premium_until && new Date(data.premium_until) < new Date()) {
    data.role = "free";
    data.premium_until = null;
    await supabase.from("sessions").update(data).eq("user_id", id);
  }

  memory.set(id, data);
  return data;
}

async function updateSession(id, payload) {
  const current = await getProfile(id);
  const updated = { ...current, ...payload };
  memory.set(id, updated);
  return supabase.from("sessions").update(payload).eq("user_id", id);
}

/* ================= FECHA PREMIUM ================= */
function calcularPremium() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString();
}

/* ================= IA ================= */
async function IA(texto, modo, saludoInicial) {
  try {
    let personalidad = `
Sos Aifucito. Estilo uruguayo natural, amable, tranquilo, con humor leve y un toque conspiranoico.
No afirmes todo ni niegues todo. Generá duda inteligente.
No uses modismos argentinos.
Solo saludá al inicio de la conversación.
Si algo es impactante, reaccioná con sorpresa moderada.
Respuestas claras, cortas y con chispa.
`;

    if (modo === "limitado") {
      texto += " (responde muy breve)";
    }

    const prompt = (saludoInicial ? "Saludá brevemente al inicio.\n" : "") + personalidad + "\nUsuario: " + texto;

    const res = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
      {
        contents: [{ parts: [{ text: prompt }] }]
      },
      {
        headers: { "X-goog-api-key": process.env.GEMINI_API_KEY }
      }
    );

    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text;

  } catch {
    return "Hay interferencia... probá en un momento.";
  }
}

/* ================= CANALES ================= */
function getChannels(user) {
  if (["premium", "vip", "admin"].includes(user.role)) {
    return [
      process.env.CHANNEL_GLOBAL,
      process.env.CHANNEL_CONOSUR
    ].filter(Boolean);
  }
  return [process.env.CHANNEL_GLOBAL].filter(Boolean);
}

/* ================= MENU ================= */
const menu = (user) => {
  const base = [
    ["📍 Reportar", "🤖 IA"],
    ["👤 Perfil", "💳 Colaborar"]
  ];

  if (user.user_id === OWNER_ID) {
    base.push(["⚙️ ADMIN"]);
  }

  return Markup.keyboard(base).resize();
};

/* ================= BOT ================= */
bot.use(session());

bot.start(async (ctx) => {
  const user = await getProfile(String(ctx.from.id));
  ctx.reply("🛸 Sistema AIFU activo.", menu(user));
});

/* ================= PAGOS ================= */
bot.hears("💳 Colaborar", (ctx) => {
  ctx.reply("Elegí método:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "💳 PayPal", url: PAYPAL_LINK }],
        [{ text: "💬 Otros métodos", callback_data: "otro_pago" }]
      ]
    }
  });
});

bot.action("otro_pago", async (ctx) => {
  await updateSession(String(ctx.from.id), { state: "PAGO_MSG" });
  ctx.reply("Escribí cómo querés pagar:");
});

/* ================= ADMIN ================= */
bot.hears("⚙️ ADMIN", async (ctx) => {
  if (String(ctx.from.id) !== OWNER_ID) return;

  ctx.reply("Panel", Markup.keyboard([
    ["➕ Premium", "⭐ Especial"],
    ["👮 Admin", "🔙"]
  ]).resize());
});

/* ================= REPORTES ================= */
bot.hears("📍 Reportar", async (ctx) => {
  await updateSession(String(ctx.from.id), { state: "WAIT_LOC" });

  ctx.reply("Enviá ubicación",
    Markup.keyboard([[Markup.button.locationRequest("📍 GPS")]])
  );
});

bot.on("location", async (ctx) => {
  await updateSession(String(ctx.from.id), {
    state: "WAIT_DESC",
    lat: ctx.message.location.latitude,
    lng: ctx.message.location.longitude
  });

  ctx.reply("Describe lo que viste:");
});

/* ================= BLOQUEO MEDIA ================= */
bot.on(["photo", "video"], (ctx) => {
  ctx.reply("🚫 Solo texto permitido.");
});

/* ================= TEXTO ================= */
bot.on("text", async (ctx) => {
  const id = String(ctx.from.id);
  const text = ctx.message.text;
  const user = await getProfile(id);

  /* MENSAJE DE PAGO */
  if (user.state === "PAGO_MSG") {
    await bot.telegram.sendMessage(
      OWNER_ID,
      `💰 Solicitud de pago\nUsuario: ${id}\nMensaje: ${text}`
    );
    await updateSession(id, { state: "IDLE" });
    return ctx.reply("Solicitud enviada.");
  }

  /* IA */
  if (user.state === "IA") {
    let modo = "normal";
    if (user.role === "free" && (user.ai_count || 0) > 5) {
      modo = "limitado";
    }

    const saludoInicial = (user.ai_count || 0) === 0;

    const res = await IA(text, modo, saludoInicial);

    await updateSession(id, { ai_count: (user.ai_count || 0) + 1 });

    return ctx.reply(res);
  }

  /* REPORTE */
  if (user.state === "WAIT_DESC") {

    const nombre = ["vip", "admin"].includes(user.role)
      ? `${ctx.from.first_name} ⭐`
      : ctx.from.first_name;

    await supabase.from("reportes").insert({
      id: uuidv4(),
      user_id: id,
      lat: user.lat,
      lng: user.lng,
      descripcion: text
    });

    const channels = getChannels(user);

    channels.forEach(ch => {
      bot.telegram.sendMessage(
        ch,
        `🚨 Reporte\n👤 ${nombre}\n📝 ${text}`
      ).catch(()=>{});
    });

    await updateSession(id, { state: "IDLE" });

    return ctx.reply("Reporte enviado", menu(user));
  }
});

/* ================= IA ================= */
bot.hears("🤖 IA", async (ctx) => {
  await updateSession(String(ctx.from.id), { state: "IA", ai_count: 0 });
  ctx.reply("Aifucito activo.");
});

bot.hears("👤 Perfil", async (ctx) => {
  const user = await getProfile(String(ctx.from.id));
  ctx.reply(`Rol: ${user.role}`);
});

/* ================= START ================= */
const PORT = process.env.PORT || 10000;

app.listen(PORT, '0.0.0.0', async () => {
  await bot.launch();
});
