import "dotenv/config";
import { Telegraf, session, Markup } from "telegraf";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";

/* ==========================================
    💎 1. CONFIGURACIÓN Y VARIABLES TÁCTICAS
========================================== */
const ADMIN_IDS = ["7662736311"]; 
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const bot = new Telegraf(process.env.BOT_TOKEN);

// Configuración de IA (Basada en tu CURL exitoso)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const aiModel = genAI.getGenerativeModel({ 
  model: "gemini-1.5-flash",
  generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
});

const CHANNELS = {
  UY: process.env.CHANNEL_UY,
  AR: process.env.CHANNEL_AR,
  CL: process.env.CHANNEL_CL,
  GLOBAL: process.env.CHANNEL_GLOBAL,
  CONOSUR: process.env.CHANNEL_CONOSUR 
};

const RANKS = [
  { xp: 0, name: "🚽 Fajinador de Retretes Espaciales" },
  { xp: 50, name: "🔭 Observador de Satélites Starlink" },
  { xp: 150, name: "💂 Guardaespalda de Alf" },
  { xp: 400, name: "🏡 Vigilante del Patio de Cridovni" },
  { xp: 800, name: "🕶️ Te Siguen los Hombres de Negro" },
  { xp: 2000, name: "🛸 Comandante Intergaláctico" }
];

/* ==========================================
    🧠 2. MOTOR DE SESIÓN (PROTECCIÓN ANTI-NULL)
========================================== */
const memory = new Map();

const getProfile = async (id) => {
  if (memory.has(id)) return memory.get(id);

  try {
    let { data, error } = await supabase.from("sessions").select("*").eq("user_id", id).maybeSingle();
    
    if (!data || error) {
      const fresh = { user_id: id, state: "IDLE", xp: 0, ai_count: 0, is_premium: false };
      const { data: newUser } = await supabase.from("sessions").upsert(fresh).select().single();
      memory.set(id, newUser);
      return newUser;
    }
    
    memory.set(id, data);
    return data;
  } catch (e) {
    console.error("Error en getProfile:", e);
    return { user_id: id, state: "IDLE", xp: 0, ai_count: 0 };
  }
};

const updateSession = async (id, payload) => {
  const current = await getProfile(id);
  const updated = { ...current, ...payload, updated_at: new Date() };
  memory.set(id, updated);
  return supabase.from("sessions").update(payload).eq("user_id", id);
};

const isAdmin = (id) => ADMIN_IDS.includes(String(id));

/* ==========================================
    🚀 3. LÓGICA DEL BOT DE TELEGRAM
========================================== */
const menu = Markup.keyboard([
  ["📍 Iniciar Reporte", "🛰️ Ver Radar"],
  ["👤 Mi Perfil", "🤖 Hablar con Aifucito"],
  ["🤝 Hacerse Colaborador", "⬅️ Menú"]
]).resize();

bot.start(async (ctx) => {
  await getProfile(String(ctx.from.id));
  ctx.reply("🌌 **RADAR AIFU V12.8**\nBienvenido, Agente. Vigilancia activa.", menu);
});

bot.hears("⬅️ Menú", async (ctx) => {
  await updateSession(String(ctx.from.id), { state: "IDLE" });
  ctx.reply("Sincronizando frecuencias...", menu);
});

bot.hears("👤 Mi Perfil", async (ctx) => {
  const user = await getProfile(String(ctx.from.id));
  const rank = [...RANKS].reverse().find(r => user.xp >= r.xp)?.name || RANKS[0].name;
  ctx.reply(`🎖️ **FICHA DE AGENTE**\n👤 ID: ${user.user_id}\n📊 XP: ${user.xp}\n🏆 Rango: ${rank}\n💎 Premium: ${user.is_premium ? "SÍ" : "NO"}`);
});

bot.hears("📍 Iniciar Reporte", async (ctx) => {
  await updateSession(String(ctx.from.id), { state: "WAITING_LOCATION" });
  ctx.reply("📡 Compartí tu ubicación actual para el radar, tú.", 
    Markup.keyboard([[Markup.button.locationRequest("📍 Enviar Ubicación")], ["⬅️ Menú"]]).oneTime().resize());
});

bot.on("location", async (ctx) => {
  const id = String(ctx.from.id);
  const user = await getProfile(id);
  if (user.state !== "WAITING_LOCATION") return;

  const { latitude: lat, longitude: lng } = ctx.message.location;
  let pais = "GLOBAL", ciudad = "Zona Rural";
  
  try {
    const geo = await axios.get(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, { timeout: 3000 });
    pais = geo.data?.address?.country_code?.toUpperCase() || "GLOBAL";
    ciudad = geo.data?.address?.city || geo.data?.address?.town || "Zona GPS";
  } catch (e) { console.warn("Geo Fallback"); }

  await updateSession(id, { state: "WAITING_DESC", lat, lng, ciudad, pais });
  ctx.reply(`📍 Localizado en ${ciudad} (${pais}).\n\n¿Qué viste tú? Describilo brevemente:`, Markup.removeKeyboard());
});

bot.on("text", async (ctx) => {
  const id = String(ctx.from.id);
  const text = ctx.message.text;

  // Evitar procesar texto si se presionó un botón de comando principal
  const botonesMenu = ["📍 Iniciar Reporte", "🛰️ Ver Radar", "👤 Mi Perfil", "🤖 Hablar con Aifucito", "🤝 Hacerse Colaborador", "⬅️ Menú"];
  if (botonesMenu.includes(text)) return;

  const user = await getProfile(id);
  if (!user) return;

  // --- Lógica de Reporte (Sincronización con Mapa) ---
  if (user.state === "WAITING_DESC") {
    try {
      const reportId = uuidv4();
      await supabase.from("reportes").insert({
        id: reportId, user_id: id, lat: user.lat, lng: user.lng, ciudad: user.ciudad, pais: user.pais, descripcion: text, created_at: new Date().toISOString()
      });
      
      const alerta = `🚨 **NUEVO REPORTE**\n📍 ${user.ciudad} (${user.pais})\n👤 Agente: ${ctx.from.first_name}\n📝 ${text}`;
      
      // Envío a canales regionales
      const canalRegional = CHANNELS[user.pais] || CHANNELS.GLOBAL;
      if (canalRegional) bot.telegram.sendMessage(canalRegional, alerta).catch(() => {});
      if (CHANNELS.CONOSUR) bot.telegram.sendMessage(CHANNELS.CONOSUR, alerta).catch(() => {});

      await updateSession(id, { state: "IDLE", xp: (user.xp || 0) + 25 });
      return ctx.reply("✅ **Recibido.** Reporte sincronizado en el mapa neón. +25 XP", menu);
    } catch (err) {
      return ctx.reply("⚠️ Error al guardar en la base de datos.");
    }
  }

  // --- Lógica de IA (gemini-flash-latest) ---
  if (user.state === "IA_CHAT") {
    if (!user.is_premium && (user.ai_count || 0) >= 3) {
      return ctx.reply("🚫 Límite de IA alcanzado (3/3). Hacete colaborador para consultas ilimitadas, tú.");
    }
    try {
      await ctx.sendChatAction("typing");
      const prompt = `Eres Aifucito, experto en ufología de Uruguay. Responde breve y con modismos locales. Usuario ${ctx.from.first_name} pregunta: ${text}`;
      const result = await aiModel.generateContent(prompt);
      const response = await result.response;
      
      await updateSession(id, { ai_count: (user.ai_count || 0) + 1 });
      return ctx.reply(`🛸 **Aifucito:** ${response.text()}`);
    } catch (e) { 
      return ctx.reply("⚠️ Interferencia en la señal IA. Reintentá."); 
    }
  }
});

bot.hears("🤖 Hablar con Aifucito", async (ctx) => {
  await updateSession(String(ctx.from.id), { state: "IA_CHAT" });
  ctx.reply("🛸 **Aifucito Online:** Escuchando frecuencias... ¿Qué quieres contarme tú hoy?", Markup.keyboard([["⬅️ Menú"]]).resize());
});

bot.hears("🛰️ Ver Radar", (ctx) => {
  ctx.reply("🌍 **ABRIR RADAR TÁCTICO:**", Markup.inlineKeyboard([
    [Markup.button.url("🗺️ Ver Mapa Live", `https://aifucito5-0.onrender.com?user_id=${ctx.from.id}`)]
  ]));
});

bot.hears("🤝 Hacerse Colaborador", (ctx) => {
  ctx.reply("🤝 **Apoyá el Proyecto:**\nDesbloqueá historial completo e IA ilimitada.\n[Mercado Pago / Prex](https://tu-link.com)");
});

/* ==========================================
    📊 4. API Y WEB (PARA EL MAPA)
========================================== */
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/reportes", async (req, res) => {
  const range = req.query.range || "24h";
  const days = { "24h": 1, "7d": 7, "1m": 30, "1y": 365 }[range] || 1;
  const fromDate = new Date(Date.now() - days * 86400000).toISOString();

  const { data } = await supabase.from("reportes")
    .select("*")
    .gte("created_at", fromDate)
    .order("created_at", { ascending: false });
  res.json(data || []);
});

/* ==========================================
    🛡️ 5. MANDO COMANDANTE (ADMIN)
========================================== */
bot.command("broadcast", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const msg = ctx.message.text.replace("/broadcast ", "");
  const { data } = await supabase.from("sessions").select("user_id");
  ctx.reply(`🚀 Transmitiendo a ${data.length} agentes...`);
  for (const u of data) {
    await new Promise(r => setTimeout(r, 250));
    bot.telegram.sendMessage(u.user_id, `📢 **AVISO DEL COMANDO:**\n\n${msg}`).catch(() => {});
  }
});

/* ==========================================
    🛡️ 6. ESTABILIDAD FINAL Y ARRANQUE
========================================== */
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`📡 NODO AIFU V12.8 ONLINE EN PUERTO ${PORT}`);
  
  setTimeout(() => {
    bot.launch()
      .then(() => console.log("🛸 BOT DESPLEGADO"))
      .catch(err => console.error("Error en launch:", err));
  }, 1000);
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
