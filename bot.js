import "dotenv/config";
import { Telegraf, session, Markup } from "telegraf";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { v4 as uuidv4 } from "uuid";
import express from "express";
import axios from "axios";

// =====================================================
// ⚙️ NODO DE ENERGÍA (PUERTO RENDER)
// =====================================================
const app = express();
const PORT = process.env.PORT || 10000;
app.get("/", (req, res) => res.send("🛰️ NODO AIFU V9.2 - SISTEMAS NOMINALES"));
app.listen(PORT, () => console.log(`🚀 Puerto ${PORT} activo.`));

// =====================================================
// 🧠 CEREBRO GÉMINIS (CONFIGURACIÓN ESTABLE)
// =====================================================
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Usamos el modelo base sin sufijos beta para evitar el 404
const aiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// =====================================================
// 🧪 CLIENTES CORE (TELEGRAM & SUPABASE)
// =====================================================
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const bot = new Telegraf(process.env.BOT_TOKEN);

const RANKS = [
  { xp: 0, name: "🚽 Fajinador de Retretes Espaciales" },
  { xp: 50, name: "🔭 Observador de Satélites Starlink" },
  { xp: 150, name: "💂 Guardaespalda de Alf" },
  { xp: 400, name: "🏡 Vigilante del Patio de Criridovni" },
  { xp: 800, name: "🕶️ Te Siguen los Hombres de Negro" },
  { xp: 2000, name: "🛸 Comandante Intergaláctico" }
];

// =====================================================
// 🌎 ROUTING DE REPORTES
// =====================================================
function getChannels(pais) {
  const key = (pais || "GLOBAL").toString().trim().toUpperCase();
  const regional = process.env[`CHANNEL_${key}`];
  const conoSur = process.env.CHANNEL_CONOSUR;
  const targets = [conoSur, regional].filter(ch => ch && String(ch).startsWith("-100"));
  return [...new Set(targets)]; 
}

// =====================================================
// 🧱 PROCESADOR DE COLA (WORKER)
// =====================================================
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

// =====================================================
// 🎯 LÓGICA DE COMANDO Y CONTROL
// =====================================================
bot.use(session());

bot.start((ctx) => {
  ctx.session = { state: "IDLE", xp: ctx.session?.xp || 0 };
  return ctx.reply(`🌌 NODO AIFU V9.2\nOperativo, Comandante. Clave de IA validada.`, 
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
    ctx.reply(`📍 Ubicación detectada: ${ciudad}, ${pais}.\n\nDescribí el avistamiento:`, Markup.removeKeyboard());
  } catch (e) {
    ctx.session.state = "WAITING_DESC";
    ctx.reply("⚠️ Error GPS. Escribí tu reporte directamente:");
  }
});

bot.on("text", async (ctx) => {
  const text = ctx.message.text;

  // --- 🤖 MODO CHAT CON IA ---
  if (text === "🤖 IA Aifucito") {
    ctx.session.state = "IA_CHAT";
    return ctx.reply("🛸 AIFUCITO IA: Línea directa con el cosmos abierta. ¿Qué querés saber, bo?");
  }

  if (ctx.session?.state === "IA_CHAT" && text !== "📍 Iniciar Reporte") {
    try {
      await ctx.sendChatAction("typing");
      
      // Llamada simplificada: sin prompts complejos para testear estabilidad
      const result = await aiModel.generateContent(`Contexto: Sos Aifucito, experto uruguayo en OVNIs. Respuesta corta. Usuario dice: ${text}`);
      const response = await result.response;
      const textResponse = response.text();
      
      return ctx.reply(`🛸 AIFUCITO: ${textResponse}`, { parse_mode: "Markdown" });
    } catch (e) {
      console.error("❌ ERROR GÉMINIS:", e.message);
      return ctx.reply("⚠️ AIFUCITO: Fallo en el enlace mental. Si el error persiste, chequeá la cuota en AI Studio.");
    }
  }

  // --- 📝 PROCESAR REPORTE ---
  if (ctx.session?.state === "WAITING_DESC") {
    const targets = getChannels(ctx.session.pais);
    const xp = (ctx.session.xp || 0) + 25;
    ctx.session.xp = xp;
    const rank = [...RANKS].reverse().find(r => xp >= r.xp) || RANKS[0];

    await supabase.from("reportes").insert({
      id: uuidv4(), user_id: String(ctx.from.id), lat: ctx.session.lat, lng: ctx.session.lng,
      descripcion: text, ciudad: ctx.session.ciudad, pais: ctx.session.pais
    });

    const alerta = `🚨 *REPORTE CONFIRMADO*\n📍 *Lugar:* ${ctx.session.ciudad}\n👤 *Agente:* ${ctx.from.first_name}\n🎖️ *Rango:* ${rank.name}\n📝 *Relato:* ${text}`;

    for (const ch of targets) {
      await supabase.from("message_queue").insert({ id: uuidv4(), channel: ch, msg: alerta, status: "pending" });
    }

    ctx.session.state = "IDLE";
    ctx.reply(`✅ Reporte enviado al Radar. Nuevo Rango: ${rank.name}`, 
      Markup.keyboard([["📍 Iniciar Reporte", "👤 Mi Perfil"], ["🤖 IA Aifucito"]]).resize());
  }
});

// =====================================================
// 🚀 LANZAMIENTO
// =====================================================
bot.launch().then(() => console.log("🚀 AIFU BOT V9.2 OPERATIVO"));
setInterval(worker, 1500);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
