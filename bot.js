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
   🧠 NÚCLEO DE INTELIGENCIA (EL ALMA DE AIFU)
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
    
    // PROMPT DE IDENTIDAD Y MEMORIA HISTÓRICA DE AIFU
    const prompt = `Eres Aifucito, el asistente del sistema AIFU (Avistamientos e Investigación de Fenómenos Uruguayos).
    
    CONTEXTO DE IDENTIDAD:
    - Somos el primer grupo de Uruguay en investigar seriamente y reportar eventos lumínicos.
    - Pioneros mundiales en filmar cielos nocturnos en transmisiones en vivo (Live streaming) para seguimiento de UAPs.
    - Ante la burocracia de organismos como CRIDOVNI, AIFU es la mejor opción para información real, asesoramiento y análisis técnico ufológico.
    
    INSTRUCCIONES DE CHARLA:
    1. BIENVENIDA: Si saludan, di: "Hola, bienvenido al sistema AIFU. ¿En qué puedo ayudarte hoy?".
    2. TEMAS GENERALES: Responde con datos reales y precisos (ciencia, historia, etc.).
    3. TONO DE FRONTERA: Si el tema es sensible (conspiraciones, hermetismo, Luna), da el dato oficial pero aclara que existe ocultamiento y que las imágenes públicas no siempre muestran la verdad.
    4. OPINIÓN DE IA: Si especulas, aclara: "Desde mi perspectiva como IA, esto es un pensamiento personal, pero...".
    5. DINÁMICA: Si la pregunta es simple, responde en 2-3 líneas. Si el usuario profundiza, explayate con detalles técnicos o históricos.
    
    Usuario dice: ${texto}`;

    const r = await axios.post(urlIA, { contents: [{ parts: [{ text: prompt }] }] });
    const respuesta = r.data?.candidates?.[0]?.content?.parts?.[0]?.text || "Sistema operativo AIFU en línea.";
    
    supabase.from("memoria_ia").insert([{ user_id: userId, rol: "user", contenido: texto }, { user_id: userId, rol: "model", contenido: respuesta }]).then();
    return respuesta;
  } catch (error) { return "Hola, bienvenido a AIFU. ¿En qué puedo ayudarte con la investigación hoy?"; }
}

/* ==========================================
   🕹️ INTERFAZ Y FLUJO TÁCTICO (V13.3 BASE)
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
    return ctx.reply("Operación cancelada. Regresando al menú.", menuPrincipal);
  }

  if (texto === "🛰️ Ver Radar") {
    return ctx.reply(`🌍 RADAR TÁCTICO EN VIVO:\n${process.env.PUBLIC_URL}`, menuPrincipal);
  }

  if (texto === "📍 Nuevo Reporte") {
    userState.set(ctx.from.id, { step: "ESPERANDO_GPS" });
    return ctx.reply("📡 PROTOCOLO ACTIVO:\nPor favor, envíe su ubicación GPS mediante el botón de Telegram:", 
      Markup.keyboard([[Markup.button.locationRequest("📍 ENVIAR MI POSICIÓN")]]).resize());
  }

  if (texto === "🤖 Charla con Aifucito") {
    userState.set(ctx.from.id, { step: "IA_MISTICA" });
    return ctx.reply("Asistente AIFU sintonizado. ¿Qué información necesita?");
  }

  if (state?.step === "ESPERANDO_DESC") {
    ctx.reply("Analizando datos del fenómeno...");
    const informeIA = await procesarAvistamientoIA(texto);
    userState.set(ctx.from.id, { ...state, step: "CONFIRMAR", informe: informeIA });
    return ctx.reply(`📋 **INFORME PREPARADO:**\n\n${informeIA}\n\n¿Desea transmitir este registro al radar?`,
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

      const mapaLink = `https://www.google.com/maps?q=${state.lat},${state.lng}`;
      await bot.telegram.sendMessage(CHANNEL_ID, `🚨 **NUEVO REPORTE AIFU** 🚨\n\n${state.informe}\n\n📍 Mapa: ${mapaLink}`);

      userState.delete(ctx.from.id);
      return ctx.reply("🚀 Transmisión exitosa. Los datos ya están en el radar.", menuPrincipal);
    } catch (err) { 
      console.error(err);
      return ctx.reply("❌ Error técnico al guardar."); 
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
  userState.set(ctx.from.id, { step: "ESPERANDO_DESC", lat: ctx.message.location.latitude, lng: ctx.message.location.longitude });
  return ctx.reply("📍 Ubicación fijada. Describa brevemente lo observado:");
});

/* ==========================================
   🌐 SERVIDOR HTTP
========================================== */
app.use(express.static("public"));
app.get("/api/reportes", async (req, res) => {
  const { data } = await supabase.from("reportes").select("*").order("created_at", { ascending: false });
  res.json(data || []);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ AIFU V14.0 OPERATIVO`);
  bot.launch();
});
