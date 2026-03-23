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
const GRUPO_RADAR_ID = process.env.GRUPO_RADAR_ID; // ID del grupo Radar Cono Sur

bot.use(session());
const userState = new Map();

/* ==========================================
   🧠 NÚCLEO DE INTELIGENCIA ARTIFICIAL
========================================== */

// 1. Analizador Táctico (Ruta corregida según Google AI Studio)
async function procesarAvistamientoIA(descripcion) {
  try {
    const urlIA = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const body = {
      contents: [{ parts: [{ text: `Actúa como el sistema central de AIFU. Analiza: "${descripcion}". Clasifica en: [FENÓMENO LUMÍNICO], [NAVE], [ENTIDAD] o [NO IDENTIFICADO]. Redacta un informe técnico breve con emojis para un radar táctico.` }] }]
    };
    const r = await axios.post(urlIA, body);
    return r.data?.candidates?.[0]?.content?.parts?.[0]?.text || descripcion;
  } catch (error) {
    console.error("Error IA Reporte:", error.message);
    return `[REPORTE DIRECTO]: ${descripcion}`; // Salvavidas para no trancar el bot
  }
}

// 2. Aifucito (Charla Mística con Memoria)
async function charlaMisticaIA(userId, texto) {
  try {
    const urlIA = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const { data: recuerdos } = await supabase.from("memoria_ia").select("rol, contenido").eq("user_id", userId).limit(5);
    const contexto = recuerdos?.map(r => `${r.rol}: ${r.contenido}`).join("\n") || "";

    const prompt = `Eres Aifucito. Tu tono es MÍSTICO y PROFUNDO. Responde a: ${texto}. Contexto previo: ${contexto}`;
    const r = await axios.post(urlIA, { contents: [{ parts: [{ text: prompt }] }] });
    const respuesta = r.data?.candidates?.[0]?.content?.parts?.[0]?.text || "...el cosmos calla.";

    await supabase.from("memoria_ia").insert([{ user_id: userId, rol: "user", contenido: texto }, { user_id: userId, rol: "model", contenido: respuesta }]);
    return respuesta;
  } catch (error) {
    return "Las estrellas están fuera de alineación. Intenta luego.";
  }
}

/* ==========================================
   🕹️ INTERFAZ Y FLUJO TELEGRAM
========================================== */

const menuPrincipal = Markup.keyboard([
  ["📍 Nuevo Reporte", "🛰️ Ver Radar"],
  ["🤖 Charla con Aifucito", "❌ Cancelar Operación"]
]).resize();

bot.start((ctx) => ctx.reply("🛸 SISTEMA AIFU ONLINE.\nEsperando órdenes, Comandante.", menuPrincipal));

bot.hears("📍 Nuevo Reporte", (ctx) => {
  userState.set(ctx.from.id, { step: "ESPERANDO_GPS" });
  return ctx.reply("📡 PROTOCOLO DE AVISTAMIENTO:\nEnvía tu ubicación GPS para el radar táctico:", 
    Markup.keyboard([[Markup.button.locationRequest("📍 ENVIAR MI POSICIÓN TÁCTICA")]]).resize());
});

bot.on("location", async (ctx) => {
  const state = userState.get(ctx.from.id);
  if (state?.step !== "ESPERANDO_GPS") return;
  userState.set(ctx.from.id, { step: "ESPERANDO_DESC", lat: ctx.message.location.latitude, lng: ctx.message.location.longitude });
  return ctx.reply("📍 Coordenadas fijadas. Describe brevemente lo observado:");
});

bot.on("text", async (ctx) => {
  const userId = String(ctx.from.id);
  const state = userState.get(ctx.from.id);
  const texto = ctx.message.text;

  // --- PASO 1: PROCESAR CON IA ---
  if (state?.step === "ESPERANDO_DESC") {
    ctx.reply("🛰️ Aifucito está analizando la señal...");
    const informeIA = await procesarAvistamientoIA(texto);
    userState.set(ctx.from.id, { ...state, step: "CONFIRMAR", informe: informeIA });
    return ctx.reply(`📋 **INFORME PREPARADO:**\n\n${informeIA}\n\n¿Confirmas el envío a la Red AIFU?`,
      Markup.keyboard([["✅ CONFIRMAR Y TRANSMITIR", "❌ Cancelar Operación"]]).resize());
  }

  // --- PASO 2: GUARDAR Y ENVIAR (EL DESTRANQUE) ---
  if (texto === "✅ CONFIRMAR Y TRANSMITIR" && state?.step === "CONFIRMAR") {
    try {
      // Guardar en Supabase
      const { error } = await supabase.from("reportes").insert({
        user_id: userId, lat: state.lat, lng: state.lng, descripcion: state.informe
      });
      if (error) throw error;

      // Enviar al Grupo Radar Cono Sur
      const mapaLink = `https://www.google.com/maps?q=${state.lat},${state.lng}`;
      await bot.telegram.sendMessage(GRUPO_RADAR_ID, `🚨 **NUEVA DETECCIÓN AIFU** 🚨\n\n${state.informe}\n\n📍 Mapa: ${mapaLink}`);

      userState.delete(ctx.from.id);
      return ctx.reply("🚀 TRANSMISIÓN EXITOSA. Reporte visible en el Radar y el Grupo.", menuPrincipal);
    } catch (err) {
      return ctx.reply("❌ Error al guardar en base de datos. Intenta de nuevo.");
    }
  }

  // --- MODO CHARLA ---
  if (state?.step === "IA_MISTICA") {
    const r = await charlaMisticaIA(userId, texto);
    return ctx.reply(r);
  }

  if (texto === "🤖 Charla con Aifucito") {
    userState.set(ctx.from.id, { step: "IA_MISTICA" });
    return ctx.reply("👁️ Has entrado en el plano de Aifucito. Pregunta...");
  }

  if (texto === "🛰️ Ver Radar") {
    return ctx.reply(`🌍 Radar Táctico: ${process.env.PUBLIC_URL}`);
  }

  if (texto === "❌ Cancelar Operación") {
    userState.delete(ctx.from.id);
    return ctx.reply("Operación abortada.", menuPrincipal);
  }
});

/* ==========================================
   🌐 SERVIDOR HTTP PARA EL MAPA
========================================== */
app.use(express.static("public"));
app.get("/api/reportes", async (req, res) => {
  const { range } = req.query;
  let query = supabase.from("reportes").select("*").order("created_at", { ascending: false });
  const ahora = new Date();
  if (range === "24h") query = query.gte("created_at", new Date(ahora - 86400000).toISOString());
  const { data } = await query;
  res.json(data || []);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ AIFU V12 Online en puerto ${PORT}`);
  bot.launch();
});
