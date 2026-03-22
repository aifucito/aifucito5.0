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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 💎 CONEXIÓN DE SISTEMAS
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const bot = new Telegraf(process.env.BOT_TOKEN);
const aiModel = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-1.5-flash" });

const ADMIN_ID = "7662736311";
const CHANNELS = { UY: process.env.CHANNEL_UY, GLOBAL: process.env.CHANNEL_GLOBAL };

/* ==========================================
   🧠 MOTOR DE PERSONALIDAD (EL AJUSTE CLAVE)
========================================== */
const AIFU_PROMPT = `Eres Aifucito, un investigador uruguayo sociable. 
Tu tono es de compañero, usas el "tú" uruguayo (ej: "¿Cómo estás tú?", "Dime qué viste"), usas "bo", "ta", "salado". 
Nada de "vos" ni tono porteño pedante. Eres experto en OVNIs y ayudas al Comandante.`;

/* ==========================================
   📂 GESTIÓN DE SESIONES Y ESTADOS
========================================== */
const getSession = async (id) => {
  let { data } = await supabase.from("sessions").select("*").eq("user_id", String(id)).maybeSingle();
  if (!data) {
    data = { user_id: String(id), state: "IDLE", xp: 0, ai_count: 0, is_premium: false };
    await supabase.from("sessions").upsert(data);
  }
  return data;
};

/* ==========================================
   🚀 INTERFAZ TÁCTICA (BOT)
========================================== */
const menuPrincipal = Markup.keyboard([
  ["📍 Reportar Avistamiento", "🛰️ Ver Radar"],
  ["🤖 Charlar con Aifucito", "👤 Mi Perfil"],
  ["💎 Ser Premium", "⬅️ Salir"]
]).resize();

bot.start(async (ctx) => {
  await getSession(ctx.from.id);
  ctx.reply("🌌 **AIFU CONTROL CENTER ACTIVO**\nBienvenido a la red de vigilancia, Comandante.", menuPrincipal);
});

bot.hears("⬅️ Salir", async (ctx) => {
  await supabase.from("sessions").update({ state: "IDLE" }).eq("user_id", String(ctx.from.id));
  ctx.reply("En espera...", menuPrincipal);
});

bot.hears("👤 Mi Perfil", async (ctx) => {
  const s = await getSession(ctx.from.id);
  ctx.reply(`🎖️ **FICHA DE AGENTE**\n📊 XP: ${s.xp}\n💎 Premium: ${s.is_premium ? "SÍ" : "NO"}\n🤖 IA: ${s.ai_count}/3`);
});

// --- EL MAPA (COMO LO RECORDÁS) ---
bot.hears("🛰️ Ver Radar", (ctx) => {
  const url = `https://${process.env.APP_NAME}.onrender.com?user_id=${ctx.from.id}`;
  ctx.reply("🌍 **ABRIENDO SCANNER DE POSICIONES:**", 
    Markup.inlineKeyboard([[Markup.button.url("🗺️ MAPA EN VIVO", url)]]));
});

// --- EL FLUJO DE REPORTE PERFECTO ---
bot.hears("📍 Reportar Avistamiento", async (ctx) => {
  await supabase.from("sessions").update({ state: "ESPERANDO_UBICACION" }).eq("user_id", String(ctx.from.id));
  ctx.reply("📡 **PASO 1:** Necesito tu ubicación para el radar.", 
    Markup.keyboard([[Markup.button.locationRequest("📍 ENVIAR MI POSICIÓN")]]).oneTime().resize());
});

bot.on("location", async (ctx) => {
  const id = String(ctx.from.id);
  const { latitude: lat, longitude: lng } = ctx.message.location;
  
  // Geocodificación para saber dónde estamos
  let ciudad = "Zona Rural";
  try {
    const res = await axios.get(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
    ciudad = res.data.address.city || res.data.address.town || "Punto GPS";
  } catch(e) {}

  await supabase.from("sessions").update({ state: "ESPERANDO_DESCRIPCION", lat, lng, ciudad }).eq("user_id", id);
  ctx.reply(`📍 Detectado en ${ciudad}.\n\n**PASO 2:** ¿Qué estás viendo tú bo? Descríbelo con detalle:`, Markup.removeKeyboard());
});

// --- LA CHARLA FLUIDA CON IA ---
bot.hears("🤖 Charlar con Aifucito", async (ctx) => {
  await supabase.from("sessions").update({ state: "IA_CHAT" }).eq("user_id", String(ctx.from.id));
  ctx.reply("🛸 Canal de comunicación abierto. Cuéntame qué quieres analizar hoy tú...", Markup.keyboard([["⬅️ Salir"]]).resize());
});

bot.on("text", async (ctx) => {
  const id = String(ctx.from.id);
  const s = await getSession(id);
  const texto = ctx.message.text;

  if (texto === "⬅️ Salir") return;

  // Lógica de guardado de reporte
  if (s.state === "ESPERANDO_DESCRIPCION") {
    const reporte = { id: uuidv4(), user_id: id, lat: s.lat, lng: s.lng, ciudad: s.ciudad, descripcion: texto, created_at: new Date() };
    await supabase.from("reportes").insert(reporte);
    
    // Alerta al canal
    bot.telegram.sendMessage(CHANNELS.UY, `🚨 **AVISTAMIENTO** en ${s.ciudad}:\n"${texto}"`).catch(() => {});
    
    await supabase.from("sessions").update({ state: "IDLE", xp: (s.xp || 0) + 50 }).eq("user_id", id);
    return ctx.reply("✅ **REPORTE ARCHIVADO.** ¡Buen trabajo bo! +50 XP", menuPrincipal);
  }

  // Lógica de conversación (IA)
  if (s.state === "IA_CHAT") {
    if (!s.is_premium && s.ai_count >= 3) return ctx.reply("🚫 Límite de IA alcanzado (3/3). Hacete Premium.");
    
    try {
      await ctx.sendChatAction("typing");
      const result = await aiModel.generateContent(`${AIFU_PROMPT}\nUsuario: ${texto}`);
      await supabase.from("sessions").update({ ai_count: (s.ai_count || 0) + 1 }).eq("user_id", id);
      ctx.reply(`🛸 **Aifucito:** ${result.response.text()}`);
    } catch(e) { ctx.reply("⚠️ Error de señal con la IA."); }
  }
});

bot.launch();

/* ==========================================
   📊 SERVIDOR DE MAPA (RADAR)
========================================== */
const app = express();
app.use(cors()); app.use(express.static(path.join(__dirname, "public")));

app.get("/api/reportes", async (req, res) => {
  const { data } = await supabase.from("reportes").select("*").order("created_at", { ascending: false }).limit(50);
  res.json(data || []);
});

app.listen(process.env.PORT || 10000, () => console.log("📡 SISTEMA OPERATIVO"));
