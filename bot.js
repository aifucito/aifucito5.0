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

// ==============================
// 🔐 NÚCLEO DE CONEXIONES
// ==============================
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const bot = new Telegraf(process.env.BOT_TOKEN);
const aiModel = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-1.5-flash" });

const ADMIN_ID = "7662736311";
const MAPA_URL = "https://aifucito5-0.onrender.com";

// ==============================
// 🧠 DIAGNÓSTICO DE PRE-VUELO
// ==============================
async function preFlightCheck() {
  console.log("🔍 [SISTEMA] Verificando integridad de componentes...");
  try {
    const botInfo = await bot.telegram.getMe();
    const { error: dbError } = await supabase.from("sessions").select("count").limit(1);
    const aiTest = await aiModel.generateContent("Hola");

    console.table([
      { Componente: "Telegram Bot", Estado: botInfo ? "✅ OK" : "❌ FAIL" },
      { Componente: "Supabase DB", Estado: !dbError ? "✅ OK" : "❌ FAIL" },
      { Componente: "Gemini IA", Estado: aiTest ? "✅ OK" : "❌ FAIL" }
    ]);
  } catch (err) {
    console.error("🚨 [SISTEMA] Error en chequeo inicial:", err.message);
  }
}

// ==============================
// 🧠 PERSONALIDAD RESCATADA (IA)
// ==============================
const AIFU_PROMPT = `Eres Aifucito, un investigador uruguayo de la AIFU, sociable y experto. 
Habla con el "tú" uruguayo ("¿Cómo estás tú?"). Usa modismos: "bo", "ta", "salado", "impecable". 
Tus respuestas deben ser claras pero con calidez de compañero. 
SIEMPRE termina con una pregunta para mantener el flujo de la investigación. 
El usuario es el Comandante Intergaláctico.`;

// ==============================
// 📂 GESTIÓN DE SESIONES
// ==============================
const getSession = async (id) => {
  let { data, error } = await supabase.from("sessions").select("*").eq("user_id", String(id)).maybeSingle();
  const esAdmin = String(id) === ADMIN_ID;

  if (!data || error) {
    data = { user_id: String(id), state: "IDLE", xp: esAdmin ? 99999 : 0, is_premium: esAdmin, ai_count: 0, lat: null, lng: null, ciudad: null };
    await supabase.from("sessions").upsert(data);
  }
  if (data && esAdmin) { data.is_premium = true; data.xp = 99999; }
  return data;
};

// ==============================
// 🎛️ INTERFAZ TÁCTICA
// ==============================
const menuPrincipal = Markup.keyboard([
  ["📍 Reportar Avistamiento", "🛰️ Ver Radar"],
  ["🤖 Charlar con Aifucito", "👤 Mi Perfil"],
  ["💎 Ser Premium", "🧠 Control Center"]
]).resize();

// ==============================
// 🚀 COMANDOS Y LÓGICA
// ==============================
bot.start(async (ctx) => {
  await getSession(ctx.from.id);
  ctx.reply("🌌 **AIFU CONTROL CENTER ACTIVO**\nBienvenido a la red de vigilancia, Comandante.", menuPrincipal);
});

bot.hears("👤 Mi Perfil", async (ctx) => {
  const s = await getSession(ctx.from.id);
  ctx.reply(`🎖️ **FICHA TÉCNICA**\nXP: ${s.xp}\nPremium: ${s.is_premium ? "SÍ" : "NO"}\nIA: ${s.ai_count}`);
});

bot.hears("🛰️ Ver Radar", (ctx) => {
  ctx.reply("🌍 **RADAR EN TIEMPO REAL:**", 
    Markup.inlineKeyboard([[Markup.button.url("🗺️ ABRIR MAPA", `${MAPA_URL}?user_id=${ctx.from.id}`)]]));
});

// --- REPORTE DE AVISTAMIENTO ---
bot.hears("📍 Reportar Avistamiento", async (ctx) => {
  await supabase.from("sessions").update({ state: "WAIT_LOC" }).eq("user_id", String(ctx.from.id));
  ctx.reply("📡 **PASO 1:** Envía tu ubicación actual:", 
    Markup.keyboard([[Markup.button.locationRequest("📍 COMPARTIR GPS")]]).oneTime().resize());
});

bot.on("location", async (ctx) => {
  const id = String(ctx.from.id);
  const s = await getSession(id);
  if (s.state !== "WAIT_LOC") return;

  const { latitude: lat, longitude: lng } = ctx.message.location;
  let ciudad = "Zona Rural";
  
  try {
    const res = await axios.get(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
    ciudad = res.data?.address?.city || res.data?.address?.town || res.data?.address?.suburb || "Zona de Avistamiento";
  } catch {}

  await supabase.from("sessions").update({ state: "WAIT_DESC", lat, lng, ciudad }).eq("user_id", id);
  ctx.reply(`📍 Detectado en: **${ciudad}**\n\n**PASO 2:** ¿Qué estás viendo tú bo? Descríbelo con detalle:`, Markup.removeKeyboard());
});

// --- PROCESADOR DE TEXTO (IA / REPORTES) ---
bot.on("text", async (ctx) => {
  const id = String(ctx.from.id);
  const s = await getSession(id);
  const texto = ctx.message.text;

  if (texto === "🧠 Control Center" || texto === "⬅️ Volver") return;

  if (s.state === "WAIT_DESC") {
    const reporte = { id: uuidv4(), user_id: id, lat: s.lat, lng: s.lng, ciudad: s.ciudad, descripcion: texto, created_at: new Date().toISOString() };
    const { error } = await supabase.from("reportes").insert(reporte);
    
    if (error) return ctx.reply("⚠️ Error al guardar en base de datos.");

    if (process.env.CHANNEL_UY) {
      bot.telegram.sendMessage(process.env.CHANNEL_UY, `🚨 **NUEVO REPORTE**\n📍 ${reporte.ciudad}\n📝 ${texto}`).catch(()=>{});
    }

    await supabase.from("sessions").update({ state: "IDLE", xp: (s.xp || 0) + 100 }).eq("user_id", id);
    return ctx.reply("✅ **REGISTRO COMPLETADO.** ¡Impecable bo! +100 XP", menuPrincipal);
  }

  if (s.state === "IA_CHAT") {
    try {
      await ctx.sendChatAction("typing");
      const result = await aiModel.generateContent(`${AIFU_PROMPT}\nUsuario: ${texto}`);
      await supabase.from("sessions").update({ ai_count: (s.ai_count || 0) + 1 }).eq("user_id", id);
      return ctx.reply(`🛸 **Aifucito:** ${result.response.text()}`);
    } catch { return ctx.reply("⚠️ Error de señal con la IA."); }
  }
});

bot.hears("🤖 Charlar con Aifucito", async (ctx) => {
  await supabase.from("sessions").update({ state: "IA_CHAT" }).eq("user_id", String(ctx.from.id));
  ctx.reply("🛸 **Enlace establecido.** ¿Qué quieres analizar tú hoy?", Markup.keyboard([["⬅️ Volver"]]).resize());
});

bot.hears("⬅️ Volver", async (ctx) => {
  await supabase.from("sessions").update({ state: "IDLE" }).eq("user_id", String(ctx.from.id));
  ctx.reply("En espera, Comandante.", menuPrincipal);
});

bot.hears("🧠 Control Center", async (ctx) => {
  if (String(ctx.from.id) !== ADMIN_ID) return ctx.reply("⛔ Acceso denegado");
  const { count } = await supabase.from("reportes").select("*", { count: "exact", head: true });
  ctx.reply(`🧠 **ESTADO DEL SISTEMA**\n\n📊 Reportes: ${count || 0}\n📡 Radar: ONLINE\n🤖 IA: CONECTADA`);
});

// ==============================
// 🚀 LANZAMIENTO
// ==============================
preFlightCheck().then(() => {
  bot.launch();
  console.log("📡 BOT LANZADO EXITOSAMENTE");
});

// ==============================
// 🌐 SERVIDOR EXPRESS (MAPA)
// ==============================
const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.get("/api/reportes", async (req, res) => {
  const { data } = await supabase.from("reportes").select("*").order("created_at", { ascending: false }).limit(100);
  res.json(data || []);
});

app.listen(process.env.PORT || 10000, () => console.log("📡 RADAR SERVER ONLINE"));
