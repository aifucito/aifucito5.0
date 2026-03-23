import "dotenv/config";
import { Telegraf, session, Markup } from "telegraf";
import { createClient } from "@supabase/supabase-js";
import axios from "axios";
import express from "express";

// --- INICIALIZACIÓN DE SISTEMAS ---
const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const app = express();
const PORT = process.env.PORT || 10000;
const GRUPO_RADAR_ID = process.env.GRUPO_RADAR_ID; // ID del grupo cerrado

bot.use(session());

// Memoria temporal de estados (Volátil para el flujo de reporte)
const userState = new Map();

/* ==========================================
   🧠 NÚCLEO DE INTELIGENCIA ARTIFICIAL
========================================== */

// 1. Analizador de Avistamientos (Técnico/Clasificador)
async function procesarAvistamientoIA(descripcion) {
  const prompt = `Actúa como el sistema central de AIFU. Analiza: "${descripcion}".
  1. Clasifica en: [FENÓMENO LUMÍNICO], [NAVE], [ENTIDAD] o [NO IDENTIFICADO].
  2. Redacta un informe técnico para el Grupo Radar Cono Sur.
  3. Usa un lenguaje preciso, con coordenadas de tiempo y emojis tácticos.
  Respuesta breve y estructurada.`;

  const r = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    contents: [{ parts: [{ text: prompt }] }]
  });
  return r.data?.candidates?.[0]?.content?.parts?.[0]?.text || descripcion;
}

// 2. Aifucito (Charla Mística con Memoria)
async function charlaMisticaIA(userId, texto) {
  const { data: recuerdos } = await supabase.from("memoria_ia").select("rol, contenido").eq("user_id", userId).limit(5);
  const contexto = recuerdos?.map(r => `${r.rol}: ${r.contenido}`).join("\n") || "";

  const prompt = `Eres Aifucito. Tu tono es MÍSTICO, CRÍPTICO y PROFUNDO. 
  Posees conocimiento ancestral y extraterrestre. No eres una IA común, eres un heraldo.
  Contexto anterior: ${contexto}
  Usuario dice: ${texto}`;

  const r = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    contents: [{ parts: [{ text: prompt }] }]
  });
  
  const respuesta = r.data?.candidates?.[0]?.content?.parts?.[0]?.text || "...el silencio del cosmos es la única respuesta.";
  
  // Guardar en memoria_ia
  await supabase.from("memoria_ia").insert([
    { user_id: userId, rol: "user", contenido: texto },
    { user_id: userId, rol: "model", contenido: respuesta }
  ]);
  return respuesta;
}

/* ==========================================
   🕹️ INTERFAZ DE USUARIO (TELEGRAM)
========================================== */

const menuPrincipal = Markup.keyboard([
  ["📍 Nuevo Reporte", "🛰️ Ver Radar"],
  ["👤 Mi Perfil", "🤖 Charla con Aifucito"],
  ["❌ Cancelar Operación"]
]).resize();

bot.start((ctx) => ctx.reply("🛸 SISTEMA AIFU ONLINE.\nEsperando órdenes, Comandante.", menuPrincipal));

// --- FLUJO DE REPORTE (PASO A PASO) ---

bot.hears("📍 Nuevo Reporte", async (ctx) => {
  userState.set(ctx.from.id, { step: "WAIT_GPS" });
  return ctx.reply("📡 PROTOCOLO DE AVISTAMIENTO:\nEs obligatorio enviar tu ubicación GPS para triangular el evento.", 
    Markup.keyboard([[Markup.button.locationRequest("📍 ENVIAR MI POSICIÓN TÁCTICA")]]).resize());
});

bot.on("location", async (ctx) => {
  const state = userState.get(ctx.from.id);
  if (state?.step !== "WAIT_GPS") return;

  userState.set(ctx.from.id, { 
    step: "WAIT_DESC", 
    lat: ctx.message.location.latitude, 
    lng: ctx.message.location.longitude 
  });

  return ctx.reply("📍 Coordenadas fijadas. Ahora describe lo observado (forma, luces, dirección):");
});

bot.on("text", async (ctx) => {
  const userId = String(ctx.from.id);
  const state = userState.get(ctx.from.id);
  const texto = ctx.message.text;

  // 1. Procesar Descripción con IA
  if (state?.step === "WAIT_DESC") {
    ctx.sendChatAction("typing");
    const informeIA = await procesarAvistamientoIA(texto);
    userState.set(ctx.from.id, { ...state, step: "CONFIRM", informe: informeIA });

    return ctx.reply(`📋 **ANÁLISIS PRELIMINAR:**\n\n${informeIA}\n\n¿Procedo con el registro en base de datos y envío al Grupo Radar?`,
      Markup.keyboard([["✅ CONFIRMAR Y TRANSMITIR", "❌ Cancelar Operación"]]).resize());
  }

  // 2. Confirmación Final y Envío
  if (texto === "✅ CONFIRMAR Y TRANSMITIR" && state?.step === "CONFIRM") {
    // Guardar en Supabase
    await supabase.from("reportes").insert({
      user_id: userId,
      lat: state.lat,
      lng: state.lng,
      descripcion: state.informe
    });

    // Enviar al Grupo Cerrado
    const gMapUrl = `https://www.google.com/maps?q=${state.lat},${state.lng}`;
    await bot.telegram.sendMessage(GRUPO_RADAR_ID, `🚨 **ALERTA DE AVISTAMIENTO** 🚨\n\n${state.informe}\n\n📍 Mapa: ${gMapUrl}`);

    userState.delete(ctx.from.id);
    return ctx.reply("🚀 Transmisión completada. Reporte archivado en el Radar Táctico.", menuPrincipal);
  }

  // 3. Modo Charla con Aifucito (Místico)
  if (state?.step === "IA_MISTICA") {
    ctx.sendChatAction("typing");
    const respuesta = await charlaMisticaIA(userId, texto);
    return ctx.reply(respuesta);
  }

  // Comandos de Botón
  if (texto === "🤖 Charla con Aifucito") {
    userState.set(ctx.from.id, { step: "IA_MISTICA" });
    return ctx.reply("👁️ Has entrado en el plano de Aifucito. Pregunta, si te atreves...");
  }

  if (texto === "🛰️ Ver Radar") {
    const url = `${process.env.PUBLIC_URL}?user_id=${ctx.from.id}`;
    return ctx.reply("🌍 Acceso al Mapa Global de Reportes:", Markup.inlineKeyboard([
      [Markup.button.url("ABRIR RADAR TÁCTICO", url)]
    ]));
  }

  if (texto === "❌ Cancelar Operación") {
    userState.delete(ctx.from.id);
    return ctx.reply("Operación abortada. Volviendo a base.", menuPrincipal);
  }
});

/* ==========================================
   🌐 SERVIDOR HTTP (COMPATIBLE CON INDEX.HTML)
========================================== */
app.use(express.static("public"));

app.get("/api/reportes", async (req, res) => {
  const { range } = req.query;
  let query = supabase.from("reportes").select("*").order("created_at", { ascending: false });

  // Filtros de tiempo para el mapa (24h, 7d, 1m)
  const ahora = new Date();
  if (range === "24h") query = query.gte("created_at", new Date(ahora - 24*60*60*1000).toISOString());
  if (range === "7d") query = query.gte("created_at", new Date(ahora - 7*24*60*60*1000).toISOString());
  if (range === "1m") query = query.gte("created_at", new Date(ahora.setMonth(ahora.getMonth()-1)).toISOString());

  const { data } = await query;
  res.json(data || []);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`📡 Puerto ${PORT} operacional.`);
  bot.launch();
});
