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

// --- 💎 CONEXIÓN BLINDADA A SUPABASE ---
// Asegúrate de que en Render tengas SUPABASE_URL y SUPABASE_KEY (service_role)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const bot = new Telegraf(process.env.BOT_TOKEN);
const aiModel = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-1.5-flash" });

const ADMIN_ID = "7662736311";
const MAPA_URL = "https://aifucito5-0.onrender.com"; 

/* ==========================================
   🧠 MOTOR IA (EL COMPAÑERO URUGUAYO)
========================================== */
const AIFU_PROMPT = `Eres Aifucito, investigador uruguayo sociable. 
Habla con el "tú" uruguayo, usa "bo", "ta", "salado". 
Eres experto, compañero y terminas con una pregunta para seguir la charla. 
El usuario es el Comandante Intergaláctico.`;

/* ==========================================
   📂 GESTIÓN DE SESIONES
========================================== */
const getSession = async (id) => {
  let { data } = await supabase.from("sessions").select("*").eq("user_id", String(id)).maybeSingle();
  const esAdmin = String(id) === ADMIN_ID;

  if (!data) {
    data = { user_id: String(id), state: "IDLE", xp: esAdmin ? 99999 : 0, is_premium: esAdmin, ai_count: 0 };
    await supabase.from("sessions").upsert(data);
  } else if (esAdmin) {
    data.is_premium = true;
    data.xp = 99999;
  }
  return data;
};

/* ==========================================
   🚀 INTERFAZ TÁCTICA
========================================== */
const menuPrincipal = Markup.keyboard([
  ["📍 Reportar Avistamiento", "🛰️ Ver Radar"],
  ["🤖 Charlar con Aifucito", "👤 Mi Perfil"],
  ["💎 Ser Premium"]
]).resize();

bot.start(async (ctx) => {
  await getSession(ctx.from.id);
  ctx.reply("🌌 **AIFU CONTROL CENTER V20.0**\nConexión con Supabase: ESTABLE.\nRadar: LISTO.", menuPrincipal);
});

bot.hears("👤 Mi Perfil", async (ctx) => {
  const s = await getSession(ctx.from.id);
  ctx.reply(`🎖️ **PERFIL**\nXP: ${s.xp}\nPremium: ${s.is_premium ? "SÍ" : "NO"}\nIA: ${s.ai_count}/∞`);
});

bot.hears("🛰️ Ver Radar", (ctx) => {
  ctx.reply("🌍 **RADAR EN VIVO:**", 
    Markup.inlineKeyboard([[Markup.button.url("🗺️ ABRIR MAPA", `${MAPA_URL}?user_id=${ctx.from.id}`)]]));
});

/* ==========================================
   📍 FLUJO DE REPORTE (CONEXIÓN A DB)
========================================== */
bot.hears("📍 Reportar Avistamiento", async (ctx) => {
  await supabase.from("sessions").update({ state: "WAIT_LOC" }).eq("user_id", String(ctx.from.id));
  ctx.reply("📡 **ENVIAME TU UBICACIÓN:**", 
    Markup.keyboard([[Markup.button.locationRequest("📍 COMPARTIR GPS")]]).oneTime().resize());
});

bot.on("location", async (ctx) => {
  const id = String(ctx.from.id);
  const { latitude: lat, longitude: lng } = ctx.message.location;
  let ciudad = "Punto GPS";

  try {
    const res = await axios.get(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
    ciudad = res.data?.address?.city || res.data?.address?.town || "Zona de Avistamiento";
  } catch(e) {}

  await supabase.from("sessions").update({ state: "WAIT_DESC", lat, lng, ciudad }).eq("user_id", id);
  ctx.reply(`📍 Ubicado en: **${ciudad}**\n\n¿Qué estás viendo tú bo? Describilo ahora para el radar:`, Markup.removeKeyboard());
});

bot.on("text", async (ctx) => {
  const id = String(ctx.from.id);
  const s = await getSession(id);
  const texto = ctx.message.text;

  // GUARDAR REPORTE REAL EN SUPABASE
  if (s.state === "WAIT_DESC") {
    const reporte = { 
        id: uuidv4(), 
        user_id: id, 
        lat: s.lat, 
        lng: s.lng, 
        ciudad: s.ciudad, 
        descripcion: texto, 
        created_at: new Date().toISOString() // Formato correcto para el mapa
    };
    
    // Inserción en tabla 'reportes'
    const { error } = await supabase.from("reportes").insert(reporte);
    
    if (error) {
        console.error("Error Supabase:", error);
        return ctx.reply("⚠️ Error al guardar en la base de datos.");
    }

    // Alerta al canal
    if(process.env.CHANNEL_UY) {
        bot.telegram.sendMessage(process.env.CHANNEL_UY, `🚨 **AVISTAMIENTO**\n📍 ${s.ciudad}\n📝 ${texto}`).catch(()=>{});
    }

    await supabase.from("sessions").update({ state: "IDLE", xp: (s.xp || 0) + 100 }).eq("user_id", id);
    return ctx.reply("✅ **REPORTE ARCHIVADO.** Ya debería figurar en el radar tú bo. +100 XP", menuPrincipal);
  }

  // IA CHAT
  if (s.state === "IA_CHAT") {
    try {
      await ctx.sendChatAction("typing");
      const result = await aiModel.generateContent(`${AIFU_PROMPT}\nUsuario: ${texto}`);
      await supabase.from("sessions").update({ ai_count: (s.ai_count || 0) + 1 }).eq("user_id", id);
      ctx.reply(`🛸 **Aifucito:** ${result.response.text()}`);
    } catch(e) { ctx.reply("⚠️ Error de señal."); }
    return;
  }
});

bot.hears("🤖 Charlar con Aifucito", async (ctx) => {
  await supabase.from("sessions").update({ state: "IA_CHAT" }).eq("user_id", String(ctx.from.id));
  ctx.reply("🛸 **Canal abierto.** ¿Qué quieres contarme tú hoy?", Markup.keyboard([["📍 Reportar Avistamiento", "🛰️ Ver Radar"]]).resize());
});

bot.launch();

/* ==========================================
   📊 API DEL RADAR (EL "PUENTE" AL MAPA)
========================================== */
const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

// Cargar index.html en la raíz
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Endpoint que lee el mapa (DEBE SER PÚBLICO)
app.get("/api/reportes", async (req, res) => {
  const { data, error } = await supabase
    .from("reportes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.listen(process.env.PORT || 10000, () => console.log("📡 SISTEMA SINCRONIZADO"));
