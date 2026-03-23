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
const CHANNEL_ID = "-1003759731798"; // Canal Radar Cono Sur

bot.use(session());
const userState = new Map();

/* ==========================================
   🧠 NÚCLEO DE INTELIGENCIA ARTIFICIAL (GEMINI FLASH)
========================================== */

async function procesarAvistamientoIA(descripcion) {
  try {
    const urlIA = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const body = {
      contents: [{ parts: [{ text: `Actúa como el sistema central de AIFU. Analiza el reporte: "${descripcion}". Clasifícalo en: [FENÓMENO LUMÍNICO], [NAVE], [ENTIDAD] o [NO IDENTIFICADO]. Redacta un informe técnico breve con emojis para el canal Radar Cono Sur.` }] }]
    };
    const r = await axios.post(urlIA, body);
    return r.data?.candidates?.[0]?.content?.parts?.[0]?.text || descripcion;
  } catch (error) {
    console.error("❌ ERROR IA:", error.message);
    return `[REPORTE DIRECTO]: ${descripcion}`;
  }
}

async function charlaMisticaIA(userId, texto) {
  try {
    const urlIA = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const prompt = `Eres Aifucito. Tu tono es MÍSTICO y PROFUNDO. Responde de forma enigmática a: ${texto}`;
    const r = await axios.post(urlIA, { contents: [{ parts: [{ text: prompt }] }] });
    const respuesta = r.data?.candidates?.[0]?.content?.parts?.[0]?.text || "...el cosmos calla.";
    
    await supabase.from("memoria_ia").insert([{ user_id: userId, rol: "user", contenido: texto }, { user_id: userId, rol: "model", contenido: respuesta }]);
    return respuesta;
  } catch (error) { return "Interferencia en el plano astral."; }
}

/* ==========================================
   🕹️ INTERFAZ Y FLUJO TÁCTICO
========================================== */

const menuPrincipal = Markup.keyboard([
  ["📍 Nuevo Reporte", "🛰️ Ver Radar"],
  ["🤖 Charla con Aifucito", "❌ Cancelar Operación"]
]).resize();

bot.start((ctx) => ctx.reply("🛸 SISTEMA AIFU ONLINE.\nRadar Cono Sur listo para monitoreo.", menuPrincipal));

bot.hears("📍 Nuevo Reporte", (ctx) => {
  userState.set(ctx.from.id, { step: "ESPERANDO_GPS" });
  return ctx.reply("📡 PROTOCOLO DE AVISTAMIENTO:\nEnvía tu ubicación GPS para el radar táctico:", 
    Markup.keyboard([[Markup.button.locationRequest("📍 ENVIAR MI POSICIÓN TÁCTICA")]]).resize());
});

bot.on("location", async (ctx) => {
  const state = userState.get(ctx.from.id);
  if (state?.step !== "ESPERANDO_GPS") return;
  userState.set(ctx.from.id, { step: "ESPERANDO_DESC", lat: ctx.message.location.latitude, lng: ctx.message.location.longitude });
  return ctx.reply("📍 Coordenadas fijadas. Describe lo observado:");
});

bot.on("text", async (ctx) => {
  const userId = String(ctx.from.id);
  const state = userState.get(ctx.from.id);
  const texto = ctx.message.text;

  if (state?.step === "ESPERANDO_DESC") {
    ctx.reply("🛰️ Aifucito procesando señal...");
    const informeIA = await procesarAvistamientoIA(texto);
    userState.set(ctx.from.id, { ...state, step: "CONFIRMAR", informe: informeIA });
    return ctx.reply(`📋 **INFORME PREPARADO:**\n\n${informeIA}\n\n¿Confirmas transmisión al Canal Radar Cono Sur?`,
      Markup.keyboard([["✅ CONFIRMAR Y TRANSMITIR", "❌ Cancelar Operación"]]).resize());
  }

  if (texto === "✅ CONFIRMAR Y TRANSMITIR" && state?.step === "CONFIRMAR") {
    try {
      // 1. Guardar en Supabase
      const { error } = await supabase.from("reportes").insert({
        user_id: userId, lat: state.lat, lng: state.lng, descripcion: state.informe
      });
      if (error) throw error;

      // 2. Transmitir al Canal Radar Cono Sur
      const mapaLink = `https://www.google.com/maps?q=${state.lat},${state.lng}`;
      await bot.telegram.sendMessage(CHANNEL_ID, `🚨 **ALERTA: RADAR CONO SUR** 🚨\n\n${state.informe}\n\n📍 Mapa: ${mapaLink}`);

      userState.delete(ctx.from.id);
      return ctx.reply("🚀 TRANSMISIÓN EXITOSA. Los datos ya están en el radar y en el canal.", menuPrincipal);
    } catch (err) {
      console.error(err);
      return ctx.reply("❌ Error al archivar reporte. Verifica conexión con base de datos.");
    }
  }

  if (state?.step === "IA_MISTICA") {
    const r = await charlaMisticaIA(userId, texto);
    return ctx.reply(r);
  }

  if (texto === "🤖 Charla con Aifucito") {
    userState.set(ctx.from.id, { step: "IA_MISTICA" });
    return ctx.reply("👁️ Sintonizando frecuencias de Aifucito... pregunta.");
  }

  if (texto === "🛰️ Ver Radar") {
    return ctx.reply(`🌍 Accede al Radar Táctico aquí: ${process.env.PUBLIC_URL}`);
  }

  if (texto === "❌ Cancelar Operación") {
    userState.delete(ctx.from.id);
    return ctx.reply("Operación abortada. Regresando a base.", menuPrincipal);
  }
});

/* ==========================================
   🌐 SERVIDOR HTTP (DIBUJA EL MAPA)
========================================== */
app.use(express.static("public"));
app.get("/api/reportes", async (req, res) => {
  const { data } = await supabase.from("reportes").select("*").order("created_at", { ascending: false });
  res.json(data || []);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ AIFU V12.1 Operativo en puerto ${PORT}`);
  bot.launch();
});
