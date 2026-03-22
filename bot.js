import "dotenv/config";
import { Telegraf, session, Markup } from "telegraf";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import express from "express";
import axios from "axios";

// =====================================================
// ⚙️ DIAGNÓSTICO DE SISTEMAS (LOAD CONFIG)
// =====================================================
function loadConfig() {
  const required = [
    "BOT_TOKEN", "SUPABASE_URL", "SUPABASE_KEY",
    "CHANNEL_AR", "CHANNEL_CL", "CHANNEL_UY", 
    "CHANNEL_GLOBAL", "CHANNEL_CONOSUR"
  ];
  const config = {};
  const missing = [];

  console.log("🧠 AIFU BOOTSTRAP: Iniciando escaneo de variables...");

  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    } else {
      config[key] = process.env[key];
    }
  }

  if (missing.length > 0) {
    console.error("❌ ERROR CRÍTICO EN CONFIGURACIÓN:");
    missing.forEach(k => console.error(`   - Falta: ${k}`));
    process.exit(1); // Aborta el despegue
  }

  console.log("✔ HARDWARE OK: Todas las llaves están en su lugar.");
  return config;
}

const config = loadConfig();

// =====================================================
// 🧠 CLIENTES Y RANGOS (MÍSTICA AIFU)
// =====================================================
const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY);
const bot = new Telegraf(config.BOT_TOKEN);

const RANKS = [
  { xp: 0, name: "🚽 Fascinador de Retretes" },
  { xp: 50, name: "🔭 Observador Civil" },
  { xp: 150, name: "🧉 Cebador del Área 51" },
  { xp: 400, name: "🛸 Investigador de Campo" },
  { xp: 1000, name: "👨‍🚀 Contacto Intergaláctico" }
];

// =====================================================
// 🛰️ SERVIDOR EXPRESS (ANTI-SUEÑO RENDER)
// =====================================================
const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (req, res) => res.send("🛰️ NODO AIFU ACTIVO"));
app.listen(PORT, () => console.log(`🚀 Puerto ${PORT} abierto para Render.`));

// =====================================================
// 🌎 ROUTING TÁCTICO DE REPORTES (VIP + REGIONAL)
// =====================================================
function getChannels(pais) {
  const key = (pais || "GLOBAL").toString().trim().toUpperCase();
  const regional = config[`CHANNEL_${key}`];
  const conoSur = config.CHANNEL_CONOSUR;

  const targets = [conoSur, regional].filter(ch => ch && ch.startsWith("-100"));
  console.log(`📡 Ruteo [${key}]: ${targets.length} canales detectados.`);
  return [...new Set(targets)]; 
}

// =====================================================
// 🧱 WORKER DE MENSAJERÍA (ANTI-ERROR 400)
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
        console.error(`❌ Fallo envío a ${job.channel}: ${err.message}`);
        await supabase.from("message_queue").update({ 
          status: "pending", 
          retry_count: (job.retry_count || 0) + 1 
        }).eq("id", job.id);
      }
    } else if (job) {
      await supabase.from("message_queue").update({ status: "invalid_id" }).eq("id", job.id);
    }
  } catch (e) { /* Error de conexión */ }
  workerRunning = false;
}

// =====================================================
// 🎯 HANDLERS DEL BOT (PERFIL, GPS Y MAPA)
// =====================================================
bot.use(session());

bot.start((ctx) => {
  ctx.session = { state: "IDLE", xp: ctx.session?.xp || 0 };
  return ctx.reply(`🛸 NODO AIFU V8.4 ONLINE\n\nBienvenido Agente. El radar está listo.`, 
    Markup.keyboard([["📍 Iniciar Reporte", "👤 Mi Perfil"], ["🤖 IA Aifucito"]]).resize());
});

bot.hears("👤 Mi Perfil", (ctx) => {
  const xp = ctx.session?.xp || 0;
  const rank = [...RANKS].reverse().find(r => xp >= r.xp) || RANKS[0];
  ctx.reply(`🎖️ *FICHA DE AGENTE*\n\n👤 *Nombre:* ${ctx.from.first_name}\n📊 *XP:* ${xp}\n🏆 *Rango:* ${rank.name}`, { parse_mode: "Markdown" });
});

bot.hears("📍 Iniciar Reporte", (ctx) => {
  ctx.session.state = "WAITING_LOCATION";
  ctx.reply("🛰️ PROTOCOLO GPS: Enviá tu ubicación para el mapa:", 
    Markup.keyboard([[Markup.button.locationRequest("📍 Enviar Ubicación")]]).oneTime().resize());
});

bot.on("location", async (ctx) => {
  if (ctx.session.state !== "WAITING_LOCATION") return;
  const { latitude: lat, longitude: lng } = ctx.message.location;
  try {
    const geo = await axios.get(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
    const pais = (geo.data?.address?.country_code || "GLOBAL").toUpperCase();
    const ciudad = geo.data?.address?.city || geo.data?.address?.town || "Zona Rural";

    ctx.session = { ...ctx.session, lat, lng, pais, ciudad, state: "WAITING_DESCRIPTION" };
    ctx.reply(`📍 Detectado: ${ciudad}, ${pais}.\n\nEscribí tu reporte detallado:`, Markup.removeKeyboard());
  } catch (e) {
    ctx.reply("⚠️ Error GPS. Escribí tu reporte directamente:");
    ctx.session.state = "WAITING_DESCRIPTION";
  }
});

bot.on("text", async (ctx) => {
  if (ctx.session.state === "WAITING_DESCRIPTION") {
    const targets = getChannels(ctx.session.pais);
    const xp = (ctx.session.xp || 0) + 25;
    ctx.session.xp = xp;
    const rank = [...RANKS].reverse().find(r => xp >= r.xp) || RANKS[0];

    // Guardar en Reportes (MAPA)
    await supabase.from("reportes").insert({
      id: uuidv4(), user_id: String(ctx.from.id),
      lat: ctx.session.lat, lng: ctx.session.lng,
      descripcion: ctx.message.text, ciudad: ctx.session.ciudad, pais: ctx.session.pais
    });

    // Encolar Mensajes
    const alerta = `🚨 *AVISTAMIENTO*\n📍 *Lugar:* ${ctx.session.ciudad}\n👤 *Agente:* ${ctx.from.first_name}\n🎖️ *Rango:* ${rank.name}\n📝 *Relato:* ${ctx.message.text}`;

    for (const ch of targets) {
      await supabase.from("message_queue").insert({
        id: uuidv4(), channel: ch, msg: alerta, status: "pending"
      });
    }

    ctx.session.state = "IDLE";
    ctx.reply(`✅ Reporte enviado, Agente. XP actual: ${xp}`, 
      Markup.keyboard([["📍 Iniciar Reporte", "👤 Mi Perfil"], ["🤖 IA Aifucito"]]).resize());
  }
});

// =====================================================
// 🚀 LANZAMIENTO
// =====================================================
bot.launch().then(() => console.log("🚀 AIFU BOT OPERATIVO"));
setInterval(worker, 1500);
