import "dotenv/config";
import { Telegraf, session, Markup } from "telegraf";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { v4 as uuidv4 } from "uuid";
import express from "express";
import axios from "axios";

// ⚙️ SERVIDOR RENDER
const app = express();
const PORT = process.env.PORT || 10000;
app.get("/", (req, res) => res.send("🛰️ NODO AIFU V8.9 - ONLINE"));
app.listen(PORT, () => console.log(`🚀 Puerto ${PORT} activo.`));

// 🧠 CONFIGURACIÓN IA (CORREGIDA)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Usamos la versión estable "gemini-1.5-flash"
const aiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// 🧪 CLIENTES CORE
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const bot = new Telegraf(process.env.BOT_TOKEN);

// 🎖️ JERARQUÍA AIFU
const RANKS = [
  { xp: 0, name: "🚽 Fajinador de Retretes Espaciales" },
  { xp: 50, name: "🔭 Observador de Satélites Starlink" },
  { xp: 150, name: "💂 Guardaespalda de Alf" },
  { xp: 400, name: "🏡 Vigilante del Patio de Criridovni" },
  { xp: 800, name: "🕶️ Te Siguen los Hombres de Negro" },
  { xp: 2000, name: "🛸 Comandante Intergaláctico" }
];

// 🌎 ROUTING
function getChannels(pais) {
  const key = (pais || "GLOBAL").toString().trim().toUpperCase();
  const regional = process.env[`CHANNEL_${key}`];
  const conoSur = process.env.CHANNEL_CONOSUR;
  const targets = [conoSur, regional].filter(ch => ch && String(ch).startsWith("-100"));
  return [...new Set(targets)]; 
}

// 🧱 WORKER
let workerRunning = false;
async function worker() {
  if (workerRunning) return;
  workerRunning = true;
  try {
    const { data: job } = await supabase.rpc("lock_next_message");
    if (job && job.channel?.startsWith("-100")) {
      try {
        await bot.telegram.sendMessage(job.channel, job.msg, { parse_mode: "Markdown" });
        await supabase.from("message_queue").update({ status: "sent" }).eq("id", job.id);
      } catch (err) {
        await supabase.from("message_queue").delete().eq("id", job.id);
      }
    } else if (job) {
      await supabase.from("message_queue").delete().eq("id", job.id);
    }
  } catch (e) {}
  workerRunning = false;
}

// 🎯 LÓGICA DEL BOT
bot.use(session());

bot.start((ctx) => {
  ctx.session = { state: "IDLE", xp: ctx.session?.xp || 0 };
  return ctx.reply(`🌌 NODO AIFU V8.9\nSistemas listos, Comandante.`, 
    Markup.keyboard([["📍 Iniciar Reporte", "👤 Mi Perfil"], ["🤖 IA Aifucito"]]).resize());
});

bot.hears("👤 Mi Perfil", (ctx) => {
  const xp = ctx.session?.xp || 0;
  const rank = [...RANKS].reverse().find(r => xp >= r.xp) || RANKS[0];
  ctx.reply(`🎖️ *FICHA:* ${ctx.from.first_name}\n📊 *XP:* ${xp}\n🏆 *Rango:* ${rank.name}`, { parse_mode: "Markdown" });
});

bot.hears("📍 Iniciar Reporte", (ctx) => {
  ctx.session.state = "WAITING_LOCATION";
  ctx.reply("🛰️ PROTOCOLO GPS: Enviá tu ubicación:", 
    Markup.keyboard([[Markup.button.locationRequest("📍 Enviar mi Ubicación")]]).oneTime().resize());
});

bot.on("location", async (ctx) => {
  if (ctx.session.state !== "WAITING_LOCATION") return;
  const { latitude: lat, longitude: lng } = ctx.message.location;
  try {
    const geo = await axios.get(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
    const pais = (geo.data?.address?.country_code || "GLOBAL").toUpperCase();
    const ciudad = geo.data?.address?.city || geo.data?.address?.town || "Zona Rural";
    ctx.session = { ...ctx.session, lat, lng, pais, ciudad, state: "WAITING_DESC" };
    ctx.reply(`📍 Ubicación: ${ciudad}, ${pais}.\n\nDescribí el avistamiento:`, Markup.removeKeyboard());
  } catch (e) {
    ctx.session.state = "WAITING_DESC";
    ctx.reply("⚠️ Error GPS. Escribí tu reporte:");
  }
});

bot.on("text", async (ctx) => {
  const text = ctx.message.text;

  // 🤖 CHAT CON IA
  if (text === "🤖 IA Aifucito") {
    ctx.session.state = "IA_CHAT";
    return ctx.reply("🛸 AIFUCITO IA: Escaneo frecuencias cósmicas... ¿Qué necesitás saber, Agente?");
  }

  if (ctx.session?.state === "IA_CHAT" && text !== "📍 Iniciar Reporte") {
    try {
      await ctx.sendChatAction("typing");
      // Prompt optimizado
      const result = await aiModel.generateContent(`Actúa como Aifucito, un experto en OVNIs del Cono Sur. Respondé de forma breve y con modismos uruguayos/argentinos. Usuario: ${text}`);
      const response = await result.response;
      return ctx.reply(`🛸 AIFUCITO: ${response.text()}`, { parse_mode: "Markdown" });
    } catch (e) { 
      console.error(e);
      return ctx.reply("⚠️ Error en la conexión mental con Géminis. Intentá más tarde."); 
    }
  }

  // 📝 PROCESAR REPORTE
  if (ctx.session?.state === "WAITING_DESC") {
    const targets = getChannels(ctx.session.pais);
    const xp = (ctx.session.xp || 0) + 25;
    ctx.session.xp = xp;
    const rank = [...RANKS].reverse().find(r => xp >= r.xp) || RANKS[0];

    await supabase.from("reportes").insert({
      id: uuidv4(), user_id: String(ctx.from.id), lat: ctx.session.lat, lng: ctx.session.lng,
      descripcion: text, ciudad: ctx.session.ciudad, pais: ctx.session.pais
    });

    const alerta = `🚨 *AVISTAMIENTO*\n📍 *Lugar:* ${ctx.session.ciudad}\n👤 *Agente:* ${ctx.from.first_name}\n🎖️ *Rango:* ${rank.name}\n📝 *Relato:* ${text}`;

    for (const ch of targets) {
      await supabase.from("message_queue").insert({ id: uuidv4(), channel: ch, msg: alerta, status: "pending" });
    }

    ctx.session.state = "IDLE";
    ctx.reply(`✅ Reporte enviado al Radar. Tu nuevo rango es: ${rank.name}`, 
      Markup.keyboard([["📍 Iniciar Reporte", "👤 Mi Perfil"], ["🤖 IA Aifucito"]]).resize());
  }
});

bot.launch().then(() => console.log("🚀 AIFU BOT V8.9 OPERATIVO"));
setInterval(worker, 1500);
