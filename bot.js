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
   🧠 NÚCLEO DE INTELECTO (AIFU)
========================================== */

async function procesarAvistamientoIA(descripcion) {
  try {
    const urlIA = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const body = {
      contents: [{ parts: [{ text: `Actúa como analista de radar experto de AIFU. Analiza: "${descripcion}". Devuelve un informe técnico de MÁXIMO 4 líneas. Estructura: 1. Tipo de fenómeno. 2. Descripción técnica breve. 3. Clasificación (UAP/FANNY). Usa español latino neutro y emojis.` }] }]
    };
    const r = await axios.post(urlIA, body);
    return r.data?.candidates?.[0]?.content?.parts?.[0]?.text || descripcion;
  } catch (error) { return `[INFORME TÉCNICO AIFU]: ${descripcion}`; }
}

async function charlaMisticaIA(userId, texto) {
  try {
    const urlIA = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const prompt = `Eres Aifucito, asistente técnico del sistema AIFU.
    IDENTIDAD CORPORATIVA:
    - AIFU: Primer grupo independiente en Uruguay. Investigación técnica y transmisiones en vivo.
    PROTOCOLOS DE COMUNICACIÓN:
    1. SALUDOS: Solo saluda si te saludan primero.
    2. TEMAS OFICIALES: Define a organismos oficiales como institucionales sin atacar, pero mencionando que AIFU es la alternativa independiente sin protocolos de reserva.
    3. OPINIÓN DE IA: Si especulas, aclara que es un pensamiento personal de la IA.
    Usuario dice: ${texto}`;

    const r = await axios.post(urlIA, { contents: [{ parts: [{ text: prompt }] }] });
    const respuesta = r.data?.candidates?.[0]?.content?.parts?.[0]?.text || "Sistema operativo AIFU en línea.";
    
    supabase.from("memoria_ia").insert([{ user_id: userId, rol: "user", contenido: texto }, { user_id: userId, rol: "model", contenido: respuesta }]).then();
    return respuesta;
  } catch (error) { return "Sistema AIFU activo."; }
}

/* ==========================================
   🕹️ INTERFAZ Y FLUJO TÁCTICO
========================================== */

const menuPrincipal = Markup.keyboard([
  ["📍 Nuevo Reporte", "🛰️ Ver Radar"],
  ["🤖 Charla con Aifucito", "❌ Cancelar Operación"]
]).resize();

bot.start((ctx) => ctx.reply("SISTEMA AIFU ONLINE.\nPlataforma de vigilancia activa.", menuPrincipal));

bot.on("text", async (ctx) => {
  const userId = String(ctx.from.id);
  const state = userState.get(ctx.from.id);
  const texto = ctx.message.text;

  if (texto === "❌ Cancelar Operación") {
    userState.delete(ctx.from.id);
    return ctx.reply("Operación cancelada.", menuPrincipal);
  }

  if (texto === "🛰️ Ver Radar") {
    return ctx.reply(`🌍 RADAR TÁCTICO EN VIVO:\n${process.env.PUBLIC_URL}`, menuPrincipal);
  }

  if (texto === "📍 Nuevo Reporte") {
    userState.set(ctx.from.id, { step: "ESPERANDO_GPS" });
    return ctx.reply("📡 PROTOCOLO ACTIVO:\nPor favor, envíe su ubicación GPS:", 
      Markup.keyboard([[Markup.button.locationRequest("📍 ENVIAR MI POSICIÓN")]]).resize());
  }

  if (texto === "🤖 Charla con Aifucito") {
    userState.set(ctx.from.id, { step: "IA_MISTICA" });
    return ctx.reply("Asistente AIFU sintonizado.");
  }

  if (state?.step === "ESPERANDO_DESC") {
    ctx.reply("Analizando datos...");
    const informeIA = await procesarAvistamientoIA(texto);
    userState.set(ctx.from.id, { ...state, step: "CONFIRMAR", informe: informeIA });
    return ctx.reply(`📋 **INFORME PREPARADO:**\n\n${informeIA}\n\n¿Desea transmitir este registro al radar?`,
      Markup.keyboard([["✅ CONFIRMAR", "❌ Cancelar Operación"]]).resize());
  }

  if (texto === "✅ CONFIRMAR" && state?.step === "CONFIRMAR") {
    try {
      await supabase.from("sessions").upsert({ user_id: userId, state: 'IDLE' }, { onConflict: 'user_id' });
      
      // Ajuste de Base de Datos: Aseguramos coordenadas numéricas exactas
      const { error } = await supabase.from("reportes").insert([{
        user_id: userId,
        lat: parseFloat(state.lat),
        lng: parseFloat(state.lng),
        descripcion: state.informe
      }]);
      
      if (error) throw error;

      // CORRECCIÓN DE ENLACE: Ahora usa tu PUBLIC_URL (Mapa Oscuro) con parámetros limpios
      const mapaLink = `${process.env.PUBLIC_URL}/?lat=${state.lat}&lng=${state.lng}`;
      
      await bot.telegram.sendMessage(CHANNEL_ID, `🚨 **NUEVO REPORTE AIFU** 🚨\n\n${state.informe}\n\n📍 Mapa Táctico: ${mapaLink}`);

      userState.delete(ctx.from.id);
      return ctx.reply("🚀 Transmisión exitosa. Los puntos están fijados en el radar.", menuPrincipal);
    } catch (err) { 
      console.error("ERROR EN TABLA:", err.message);
      return ctx.reply("❌ Error al guardar en tabla. Reintente confirmar."); 
    }
  }

  if (state?.step === "IA_MISTICA") {
    ctx.sendChatAction("typing");
    const r = await charlaMisticaIA(userId, texto);
    return ctx.reply(r);
  }
});

bot.on("location", async (ctx) => {
  const state = userState.get(ctx.from.id);
  if (state?.step !== "ESPERANDO_GPS") return;
  userState.set(ctx.from.id, { 
    step: "ESPERANDO_DESC", 
    lat: ctx.message.location.latitude, 
    lng: ctx.message.location.longitude 
  });
  return ctx.reply("📍 Ubicación fijada. Describa brevemente lo observado:");
});

app.use(express.static("public"));
app.get("/api/reportes", async (req, res) => {
  const { data } = await supabase.from("reportes").select("*").order("created_at", { ascending: false });
  res.json(data || []);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ AIFU V14.6 OPERATIVO`);
  bot.launch();
});
