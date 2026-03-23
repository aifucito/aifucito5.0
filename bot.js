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
   🧠 NÚCLEO DE INTELIGENCIA ARTIFICIAL (OPTIMIZADO)
========================================== */

// ANALIZADOR DE REPORTES (RÁPIDO)
async function procesarAvistamientoIA(descripcion) {
  try {
    const urlIA = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const body = {
      contents: [{ parts: [{ text: `Eres el procesador táctico de AIFU. Clasifica este reporte: "${descripcion}". Devuelve: Clase de fenómeno, un resumen de 1 línea y emojis técnicos. Sé breve.` }] }]
    };
    const r = await axios.post(urlIA, body);
    return r.data?.candidates?.[0]?.content?.parts?.[0]?.text || descripcion;
  } catch (error) {
    return `[REPORTE]: ${descripcion}`;
  }
}

// CHARLA MÍSTICA (RESTRINGIDA A 2 LÍNEAS)
async function charlaMisticaIA(userId, texto) {
  try {
    const urlIA = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`;
    
    // Solo traemos los últimos 2 mensajes para no ralentizar la consulta
    const { data: recuerdos } = await supabase.from("memoria_ia").select("rol, contenido").eq("user_id", userId).order('id', { ascending: false }).limit(2);
    const contexto = recuerdos?.map(r => `${r.rol}: ${r.contenido}`).reverse().join("\n") || "";

    const prompt = `Eres Aifucito, oráculo del radar AIFU. 
    REGLA DE ORO: Responde en MÁXIMO 2 líneas. Tono enigmático pero muy breve.
    Contexto previo: ${contexto}
    Usuario: ${texto}`;

    const r = await axios.post(urlIA, { contents: [{ parts: [{ text: prompt }] }] });
    const respuesta = r.data?.candidates?.[0]?.content?.parts?.[0]?.text || "...el éter calla.";
    
    // Guardado en segundo plano (sin esperar para responder más rápido)
    supabase.from("memoria_ia").insert([{ user_id: userId, rol: "user", contenido: texto }, { user_id: userId, rol: "model", contenido: respuesta }]).then();
    
    return respuesta;
  } catch (error) { return "Interferencia astral. Sé breve."; }
}

/* ==========================================
   🕹️ INTERFAZ Y FLUJO TÁCTICO
========================================== */

const menuPrincipal = Markup.keyboard([
  ["📍 Nuevo Reporte", "🛰️ Ver Radar"],
  ["🤖 Charla con Aifucito", "❌ Cancelar Operación"]
]).resize();

bot.start((ctx) => ctx.reply("🛸 SISTEMA AIFU ONLINE.\nRadar Cono Sur listo.", menuPrincipal));

// --- MANEJO DE TEXTO Y ESTADOS ---
bot.on("text", async (ctx) => {
  const userId = String(ctx.from.id);
  const state = userState.get(ctx.from.id);
  const texto = ctx.message.text;

  // 1. PRIORIDAD ABSOLUTA: COMANDOS DE CONTROL
  if (texto === "❌ Cancelar Operación") {
    userState.delete(ctx.from.id);
    return ctx.reply("Operación abortada. Base limpia.", menuPrincipal);
  }

  if (texto === "🛰️ Ver Radar") {
    return ctx.reply(`🌍 RADAR TÁCTICO ONLINE:\n${process.env.PUBLIC_URL}`, menuPrincipal);
  }

  if (texto === "📍 Nuevo Reporte") {
    userState.set(ctx.from.id, { step: "ESPERANDO_GPS" });
    return ctx.reply("📡 Envía tu ubicación GPS actual:", 
      Markup.keyboard([[Markup.button.locationRequest("📍 ENVIAR MI POSICIÓN TÁCTICA")]]).resize());
  }

  if (texto === "🤖 Charla con Aifucito") {
    userState.set(ctx.from.id, { step: "IA_MISTICA" });
    return ctx.reply("👁️ Sintonizando frecuencias... ¿Qué buscas?");
  }

  // 2. FLUJO DE REPORTE
  if (state?.step === "ESPERANDO_DESC") {
    ctx.reply("🛰️ Aifucito analizando señal...");
    const informeIA = await procesarAvistamientoIA(texto);
    userState.set(ctx.from.id, { ...state, step: "CONFIRMAR", informe: informeIA });
    return ctx.reply(`📋 **INFORME PREPARADO:**\n\n${informeIA}\n\n¿Transmitir al Canal?`,
      Markup.keyboard([["✅ CONFIRMAR Y TRANSMITIR", "❌ Cancelar Operación"]]).resize());
  }

  if (texto === "✅ CONFIRMAR Y TRANSMITIR" && state?.step === "CONFIRMAR") {
    try {
      const { error } = await supabase.from("reportes").insert({
        user_id: userId, lat: state.lat, lng: state.lng, descripcion: state.informe
      });
      if (error) throw error;

      // Usar template string corregido para el mapa
      const mapaLink = `https://www.google.com/maps?q=${state.lat},${state.lng}`;
      await bot.telegram.sendMessage(CHANNEL_ID, `🚨 **NUEVO REGISTRO RADAR** 🚨\n\n${state.informe}\n\n📍 Mapa: ${mapaLink}`);

      userState.delete(ctx.from.id);
      return ctx.reply("🚀 TRANSMISIÓN EXITOSA.", menuPrincipal);
    } catch (err) { return ctx.reply("❌ Error de base de datos."); }
  }

  // 3. RESPUESTA DE LA IA (SOLO SI ESTÁ EN MODO MÍSTICO)
  if (state?.step === "IA_MISTICA") {
    ctx.sendChatAction("typing");
    const r = await charlaMisticaIA(userId, texto);
    return ctx.reply(r);
  }
});

bot.on("location", async (ctx) => {
  const state = userState.get(ctx.from.id);
  if (state?.step !== "ESPERANDO_GPS") return;
  userState.set(ctx.from.id, { step: "ESPERANDO_DESC", lat: ctx.message.location.latitude, lng: ctx.message.location.longitude });
  return ctx.reply("📍 Coordenadas fijadas. Describe brevemente lo observado:");
});

/* ==========================================
   🌐 SERVIDOR HTTP
========================================== */
app.use(express.static("public"));
app.get("/api/reportes", async (req, res) => {
  const { range } = req.query;
  let query = supabase.from("reportes").select("*").order("created_at", { ascending: false });
  
  // Filtro de tiempo real para que el contador sea exacto
  if (range === "24h") query = query.gte("created_at", new Date(Date.now() - 24*60*60*1000).toISOString());
  if (range === "7d") query = query.gte("created_at", new Date(Date.now() - 7*24*60*60*1000).toISOString());

  const { data } = await query;
  res.json(data || []);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ AIFU V12.5 ONLINE`);
  bot.launch();
});
