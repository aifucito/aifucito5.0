import "dotenv/config";
import { Telegraf, Markup } from "telegraf";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";

/* ==========================================
   💎 1. CONFIGURACIÓN, RANGOS Y CANALES
========================================== */
const OWNER_ID = "7662736311";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const bot = new Telegraf(process.env.BOT_TOKEN);
const aiModel = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-1.5-flash" });

// Canales de Despliegue
const CHANNELS = {
  UY: process.env.CHANNEL_UY,
  AR: process.env.CHANNEL_AR,
  CL: process.env.CHANNEL_CL,
  GLOBAL: process.env.CHANNEL_GLOBAL,
  CONOSUR: process.env.CHANNEL_CONOSUR 
};

// 🎖️ TUS RANGOS PERSONALIZADOS (Recuperados)
const RANKS = [
  { xp: 0, name: "Fajinador de Retretes espaciales" },
  { xp: 50, name: "Observador de Satélites starlink" },
  { xp: 150, name: "Guardaespalda de Alf" },
  { xp: 400, name: "Vigilante del Patio cridovni" },
  { xp: 800, name: "Agente de Campo nasa" },
  { xp: 2000, name: "Investigador RADAR AIFU" }
];

const PLANES = {
  FREE: { ai_limit: 3, label: "GRATUITO" },
  PREMIUM: { ai_limit: Infinity, label: "COLABORADOR 💎" }
};

/* ==========================================
   🧠 2. MOTOR DE SESIÓN Y CONTROL
========================================== */
const getProfile = async (id) => {
  let { data } = await supabase.from("sessions").select("*").eq("user_id", id).maybeSingle();
  if (!data) {
    const fresh = { user_id: id, state: "IDLE", xp: 0, ai_count: 0, payment_status: "free", is_premium: false };
    const { data: n } = await supabase.from("sessions").upsert(fresh).select().single();
    return n;
  }
  return data;
};

const updateSession = (id, payload) => supabase.from("sessions").update({ ...payload, updated_at: new Date() }).eq("user_id", id);
const getLimits = (user) => user.is_premium ? PLANES.PREMIUM : PLANES.FREE;
const isAdmin = (id) => String(id) === OWNER_ID;

const menu = Markup.keyboard([
  ["📍 Iniciar Reporte", "🛰️ Ver Radar"],
  ["👤 Mi Perfil", "🤖 Hablar con Aifucito"],
  ["🤝 Hacerse Colaborador", "⬅️ Menú"]
]).resize();

/* ==========================================
   🚀 3. LÓGICA DEL BOT (ESTADOS Y PRIVILEGIOS)
========================================== */

bot.start(async (ctx) => {
  await getProfile(String(ctx.from.id));
  ctx.reply("🌌 **RADAR AIFU ACTIVADO**\n\nBienvenido Agente. Sistema de monitoreo de fenómenos anómalos. ¿Qué misión tenemos tú hoy?", menu);
});

bot.hears("⬅️ Menú", async (ctx) => {
  await updateSession(String(ctx.from.id), { state: "IDLE" });
  return ctx.reply("Sincronizando frecuencias...", menu);
});

// --- PERFIL CON TUS RANGOS ---
bot.hears("👤 Mi Perfil", async (ctx) => {
  const user = await getProfile(String(ctx.from.id));
  const rank = [...RANKS].reverse().find(r => user.xp >= r.xp)?.name || RANKS[0].name;
  const limits = getLimits(user);
  ctx.reply(`🎖️ **FICHA DE AGENTE**\n👤 ID: ${user.user_id}\n📊 XP: ${user.xp}\n🏆 Rango: ${rank}\n💎 Estado: ${limits.label}`);
});

// --- REPORTES CON RUTEO POR PAÍS ---
bot.hears("📍 Iniciar Reporte", async (ctx) => {
  await updateSession(String(ctx.from.id), { state: "WAITING_LOCATION" });
  ctx.reply("📡 Compartí tu ubicación actual para geolocalizar el fenómeno, tú.", 
    Markup.keyboard([[Markup.button.locationRequest("📍 Compartir Ubicación")], ["⬅️ Menú"]]).oneTime().resize());
});

bot.on("location", async (ctx) => {
  const userId = String(ctx.from.id);
  const { latitude: lat, longitude: lng } = ctx.message.location;
  let pais = "GLOBAL", ciudad = "Zona Rural";

  try {
    const geo = await axios.get(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, { timeout: 3000 });
    const code = geo.data?.address?.country_code?.toUpperCase();
    if (["UY", "AR", "CL"].includes(code)) pais = code;
    ciudad = geo.data?.address?.city || geo.data?.address?.town || "GPS";
  } catch (e) { console.warn("Geo Fallback"); }

  await updateSession(userId, { state: "WAITING_DESC", lat, lng, ciudad, pais });
  ctx.reply(`📍 Ubicado en ${ciudad} (${pais}).\n\n¿Qué viste tú? Describilo:`, Markup.removeKeyboard());
});

bot.on("text", async (ctx) => {
  const id = String(ctx.from.id);
  const user = await getProfile(id);
  const text = ctx.message.text;

  if (text === "⬅️ Menú" || text === "⬅️ Volver al Menú") return;

  // PROCESAR REPORTE HISTÓRICO
  if (user.state === "WAITING_DESC") {
    await supabase.from("reportes").insert({
      id: uuidv4(), user_id: id, lat: user.lat, lng: user.lng, ciudad: user.ciudad, pais: user.pais, descripcion: text, created_at: new Date().toISOString()
    });

    const alerta = `🚨 **NUEVO REPORTE**\n📍 ${user.ciudad} (${user.pais})\n👤 Agente: ${ctx.from.first_name}\n📝 ${text}`;
    const canalDestino = CHANNELS[user.pais] || CHANNELS.GLOBAL;
    
    bot.telegram.sendMessage(canalDestino, alerta).catch(() => {});
    bot.telegram.sendMessage(CHANNELS.CONOSUR, alerta).catch(() => {});

    await updateSession(id, { state: "IDLE", xp: user.xp + 25 });
    return ctx.reply("✅ **Sincronizado.** Tu reporte ya está en la red.", menu);
  }

  // MODO IA CON CONTROL DE LÍMITES
  if (user.state === "IA_CHAT") {
    const limits = getLimits(user);
    if (!user.is_premium && user.ai_count >= limits.ai_limit) return ctx.reply("🚫 Límite de IA alcanzado (3/3).");

    try {
      await ctx.sendChatAction("typing");
      const res = await aiModel.generateContent(`Eres Aifucito, uruguayo amable. Usuario: ${ctx.from.first_name}. Mensaje: ${text}`);
      await supabase.from("sessions").update({ ai_count: user.ai_count + 1 }).eq("user_id", id);
      return ctx.reply(`🛸 **Aifucito:** ${res.response.text()}`);
    } catch (e) { return ctx.reply("⚠️ Error de señal IA."); }
  }
});

bot.hears("🤖 Hablar con Aifucito", async (ctx) => {
  await updateSession(String(ctx.from.id), { state: "IA_CHAT" });
  ctx.reply("🛸 **Aifucito Online:** ¿Qué quieres contarme tú hoy?", Markup.keyboard([["⬅️ Menú"]]).resize());
});

bot.hears("🛰️ Ver Radar", (ctx) => {
  ctx.reply("🌍 **RADAR AIFU:**", Markup.inlineKeyboard([[Markup.button.url("🗺️ Abrir Mapa Táctico", "https://aifucito5-0.onrender.com")]]));
});

bot.hears("🤝 Hacerse Colaborador", (ctx) => {
  ctx.reply("🤝 **Apoya a AIFU:** IA ilimitada y acceso al histórico total.\n\n[Pagar suscripción](https://tu-link.com)", menu);
});

/* ==========================================
   📊 4. API RADAR (HISTÓRICO)
========================================== */
const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/reportes", async (req, res) => {
  const { range } = req.query; // ?range=24h o 7d
  const days = range === "24h" ? 1 : 7;
  const from = new Date(Date.now() - days * 86400000).toISOString();

  const { data } = await supabase.from("reportes").select("*").gte("created_at", from).order("created_at", { ascending: false });
  res.json(data || []);
});

/* ==========================================
   🛡️ 5. MANDO ADMIN
========================================== */
bot.command("broadcast", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const msg = ctx.message.text.replace("/broadcast ", "");
  const { data: users } = await supabase.from("sessions").select("user_id");

  for (const u of users || []) {
    await new Promise(r => setTimeout(r, 250));
    bot.telegram.sendMessage(u.user_id, `📢 **AVISO COMANDANTE:**\n\n${msg}`).catch(() => {});
  }
  ctx.reply("✅ Broadcast enviado.");
});

bot.command("activar", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const targetId = ctx.message.text.split(" ")[1];
  await supabase.from("sessions").update({ is_premium: true, payment_status: "premium" }).eq("user_id", targetId);
  ctx.reply(`✅ Agente ${targetId} elevado a Colaborador.`);
});

bot.launch();
app.listen(process.env.PORT || 10000, () => console.log("📡 RADAR AIFU V12.1 ONLINE"));
