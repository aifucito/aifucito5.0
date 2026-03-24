import "dotenv/config";
import { Telegraf, session, Markup } from "telegraf";
import { createClient } from "@supabase/supabase-js";
import axios from "axios";
import express from "express";

// --- CONFIGURACIÓN DE SISTEMAS ---
const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const app = express();
const PORT = process.env.PORT || 10000;
const CHANNEL_ID = "-1003759731798"; 

bot.use(session());
const userState = new Map();

/* ==========================================
   🧠 NÚCLEO DE INTELIGENCIA (EJECUTIVO Y BREVE)
========================================== */

async function procesarAvistamientoIA(descripcion) {
  try {
    const urlIA = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const body = {
      contents: [{ parts: [{ text: `Actúa como analista de radar. Analiza: "${descripcion}". Devuelve un informe de MÁXIMO 4 líneas. Estructura: 1. Tipo de fenómeno. 2. Descripción breve. 3. Clasificación técnica (UAP/FANNY). Usa español latino neutro y emojis.` }] }]
    };
    const r = await axios.post(urlIA, body);
    return r.data?.candidates?.[0]?.content?.parts?.[0]?.text || descripcion;
  } catch (error) { return `[INFORME]: ${descripcion}`; }
}

async function charlaMisticaIA(userId, texto) {
  try {
    const urlIA = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const prompt = `Eres el asistente AIFU. Responde de forma clara y profesional (máximo 3 líneas). Usa español latino neutro. Si saludan, sé cortés y ofrece ayuda con el radar. Usuario: ${texto}`;
    const r = await axios.post(urlIA, { contents: [{ parts: [{ text: prompt }] }] });
    const respuesta = r.data?.candidates?.[0]?.content?.parts?.[0]?.text || "Sistema en línea.";
    supabase.from("memoria_ia").insert([{ user_id: userId, rol: "user", contenido: texto }, { user_id: userId, rol: "model", contenido: respuesta }]).then();
    return respuesta;
  } catch (error) { return "Hola, ¿en qué puedo ayudarle hoy?"; }
}

/* ==========================================
   🕹️ INTERFAZ Y FLUJO
========================================== */

const menuPrincipal = Markup.keyboard([
  ["📍 Nuevo Reporte", "🛰️ Ver Radar"],
  ["🤖 Charla con Aifucito", "❌ Cancelar Operación"]
]).resize();

bot.start((ctx) => ctx.reply("SISTEMA AIFU ONLINE.\nPlataforma de vigilancia del Cono Sur activa.", menuPrincipal));

bot.on("text", async (ctx) => {
  const userId = String(ctx.from.id);
  const state = userState.get(ctx.from.id);
  const texto = ctx.message.text;

  if (texto === "❌ Cancelar Operación") {
    userState.delete(ctx.from.id);
    return ctx.reply("Operación cancelada.", menuPrincipal);
  }

  if (texto === "🛰️ Ver Radar") {
    return ctx.reply(`🌍 RADAR TÁCTICO:\n${process.env.PUBLIC_URL}`, menuPrincipal);
  }

  if (texto === "📍 Nuevo Reporte") {
    userState.set(ctx.from.id, { step: "ESPERANDO_GPS" });
    return ctx.reply("📡 Envíe su ubicación GPS:", 
      Markup.keyboard([[Markup.button.locationRequest("📍 ENVIAR MI POSICIÓN")]]).resize());
  }

  if (texto === "🤖 Charla con Aifucito") {
    userState.set(ctx.from.id, { step: "IA_MISTICA" });
    return ctx.reply("Asistente AIFU activo. ¿Qué necesita?");
  }

  if (state?.step === "ESPERANDO_DESC") {
    ctx.reply("Analizando fenómeno...");
    const informeIA = await procesarAvistamientoIA(texto);
    userState.set(ctx.from.id, { ...state, step: "CONFIRMAR", informe: informeIA });
    return ctx.reply(`📋 **INFORME PREPARADO:**\n\n${informeIA}\n\n¿Transmitir?`,
      Markup.keyboard([["✅ CONFIRMAR", "❌ Cancelar Operación"]]).resize());
  }

  if (texto === "✅ CONFIRMAR" && state?.step === "CONFIRMAR") {
    try {
      await supabase.from("sessions").upsert({ user_id: userId, state: 'IDLE' }, { onConflict: 'user_id' });
      const { error } = await supabase.from("reportes").insert([{
        user_id: userId,
        lat: parseFloat(state.lat),
        lng: parseFloat(state.lng),
        descripcion: state.informe
      }]);
      if (error) throw error;

      // Link corregido para Telegram
      const mapaLink = `https://www.google.com/maps?q=${state.lat},${state.lng}`;
      
      await bot.telegram.sendMessage(CHANNEL_ID, `🚨 **NUEVO REPORTE AIFU** 🚨\n\n${state.informe}\n\n📍 Mapa: ${mapaLink}`);

      userState.delete(ctx.from.id);
      return ctx.reply("🚀 Transmisión exitosa.", menuPrincipal);
    } catch (err) { 
      console.error(err);
      return ctx.reply("❌ Error al guardar. Intente de nuevo."); 
    }
  }

  if (state?.step === "IA_MISTICA") {
    const r = await charlaMisticaIA(userId, texto);
    return ctx.reply(r);
  }
});

bot.on("location", async (ctx) => {
  const state = userState.get(ctx.from.id);
  if (state?.step !== "ESPERANDO_GPS") return;
  userState.set(ctx.from.id, { step: "ESPERANDO_DESC", lat: ctx.message.location.latitude, lng: ctx.message.location.longitude });
  return ctx.reply("📍 Ubicación recibida. Describa lo observado:");
});

app.use(express.static("public"));
app.get("/api/reportes", async (req, res) => {
  const { data } = await supabase.from("reportes").select("*").order("created_at", { ascending: false });
  res.json(data || []);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ AIFU V13.2 ONLINE`);
  bot.launch();
});
