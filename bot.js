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

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const bot = new Telegraf(process.env.BOT_TOKEN);
const aiModel = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-1.5-flash" });

const ADMIN_ID = "7662736311";
const MAPA_URL = "https://aifucito5-0.onrender.com"; // URL FIJA SOLICITADA

const AIFU_PROMPT = `Eres Aifucito, investigador uruguayo de la AIFU. 
Habla con el "tú" uruguayo, usa "bo", "ta", "salado". 
Eres compañero y experto. El usuario es el Comandante Intergaláctico.`;

/* ==========================================
   📂 GESTIÓN DE SESIONES (CON RANGO ADMIN)
========================================== */
const getSession = async (id) => {
  let { data } = await supabase.from("sessions").select("*").eq("user_id", String(id)).maybeSingle();
  
  // Lógica de Administrador (Tú siempre tienes todo)
  const esAdmin = String(id) === ADMIN_ID;

  if (!data) {
    data = { 
      user_id: String(id), state: "IDLE", 
      xp: esAdmin ? 99999 : 0, 
      is_premium: esAdmin ? true : false,
      ai_count: 0 
    };
    await supabase.from("sessions").upsert(data);
  } else if (esAdmin) {
    // Aseguramos que el admin siempre sea premium en cada consulta
    data.is_premium = true;
    data.xp = 99999;
  }
  return data;
};

/* ==========================================
   🚀 INTERFAZ (MENÚ LIMPIO)
========================================== */
const menuPrincipal = Markup.keyboard([
  ["📍 Reportar Avistamiento", "🛰️ Ver Radar"],
  ["🤖 Charlar con Aifucito", "👤 Mi Perfil"],
  ["💎 Ser Premium"]
]).resize();

bot.start(async (ctx) => {
  await getSession(ctx.from.id);
  ctx.reply("🌌 **AIFU CONTROL CENTER ONLINE**\nSistemas listos, Comandante.", menuPrincipal);
});

bot.hears("👤 Mi Perfil", async (ctx) => {
  const s = await getSession(ctx.from.id);
  const rango = s.user_id === ADMIN_ID ? "Comandante Intergaláctico" : "Agente de Campo";
  ctx.reply(`🎖️ **PERFIL DE AGENTE**\n\n🆔 ID: ${s.user_id}\n🏆 Rango: ${rango}\n📊 XP: ${s.xp}\n💎 Premium: ${s.is_premium ? "ACTIVO" : "NO"}\n🤖 IA: ${s.ai_count}/∞`);
});

bot.hears("🛰️ Ver Radar", (ctx) => {
  ctx.reply("🌍 **RADAR TÁCTICO AIFU:**", 
    Markup.inlineKeyboard([[Markup.button.url("🗺️ ABRIR MAPA EN VIVO", `${MAPA_URL}?user_id=${ctx.from.id}`)]]));
});

bot.hears("📍 Reportar Avistamiento", async (ctx) => {
  await supabase.from("sessions").update({ state: "ESPERANDO_UBICACION" }).eq("user_id", String(ctx.from.id));
  ctx.reply("📡 **ENVIAME TU UBICACIÓN:**", 
    Markup.keyboard([[Markup.button.locationRequest("📍 COMPARTIR PUNTO GPS")]]).oneTime().resize());
});

/* ==========================================
   🕹️ PROCESAMIENTO DE DATOS
========================================== */
bot.on("location", async (ctx) => {
  const id = String(ctx.from.id);
  const { latitude: lat, longitude: lng } = ctx.message.location;
  let ciudad = "Punto GPS";

  try {
    const res = await axios.get(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
    ciudad = res.data?.address?.city || res.data?.address?.town || res.data?.address?.suburb || "Zona de Avistamiento";
  } catch(e) {}

  await supabase.from("sessions").update({ state: "ESPERANDO_DESCRIPCION", lat, lng, ciudad }).eq("user_id", id);
  ctx.reply(`📍 Detectado en: **${ciudad}**\n\n¿Qué estás viendo tú bo? Describilo ahora:`, Markup.removeKeyboard());
});

bot.on("text", async (ctx) => {
  const id = String(ctx.from.id);
  const s = await getSession(id);
  const texto = ctx.message.text;

  // 1. Manejo de Reportes
  if (s.state === "ESPERANDO_DESCRIPCION") {
    const reporte = { 
        id: uuidv4(), user_id: id, lat: s.lat, lng: s.lng, 
        ciudad: s.ciudad, descripcion: texto, created_at: new Date().toISOString() 
    };
    await supabase.from("reportes").insert(reporte);
    
    // Alerta al canal (Si tenés configurado el canal en .env)
    if(process.env.CHANNEL_UY) {
        bot.telegram.sendMessage(process.env.CHANNEL_UY, `🚨 **NUEVO AVISTAMIENTO**\n📍 ${s.ciudad}\n📝 ${texto}`).catch(()=>{});
    }

    await supabase.from("sessions").update({ state: "IDLE", xp: (s.xp || 0) + 100 }).eq("user_id", id);
    return ctx.reply("✅ **REPORTE ARCHIVADO.** Los datos ya están en el radar bo. +100 XP", menuPrincipal);
  }

  // 2. Manejo de IA (Charlar)
  if (s.state === "IA_CHAT") {
    try {
      await ctx.sendChatAction("typing");
      const result = await aiModel.generateContent(`${AIFU_PROMPT}\nUsuario: ${texto}`);
      await supabase.from("sessions").update({ ai_count: (s.ai_count || 0) + 1 }).eq("user_id", id);
      ctx.reply(`🛸 **Aifucito:** ${result.response.text()}`);
    } catch(e) { ctx.reply("⚠️ Error en el enlace con la IA."); }
    return;
  }
});

bot.hears("🤖 Charlar con Aifucito", async (ctx) => {
  await supabase.from("sessions").update({ state: "IA_CHAT" }).eq("user_id", String(ctx.from.id));
  ctx.reply("🛸 **Canal abierto.** Preguntame lo que quieras tú...", Markup.keyboard([["📍 Reportar Avistamiento", "🛰️ Ver Radar"]]).resize());
});

bot.hears("💎 Ser Premium", (ctx) => {
  ctx.reply("💎 **SISTEMA COLABORADOR**\n\nSi no eres el Comandante, contacta a @damian_aifu para activar tu cuenta.");
});

bot.launch();

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));
app.get("/api/reportes", async (req, res) => {
  const { data } = await supabase.from("reportes").select("*").order("created_at", { ascending: false }).limit(100);
  res.json(data || []);
});
app.listen(process.env.PORT || 10000);
