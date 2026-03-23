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
   🧠 NÚCLEO DE INTELIGENCIA (MODO ASISTENTE NEUTRO)
========================================== */

async function procesarAvistamientoIA(descripcion) {
  try {
    const urlIA = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const body = {
      contents: [{ parts: [{ text: `Actúa como un analista técnico de radar. Clasifica este reporte: "${descripcion}". Devuelve un resumen de 1 línea con emojis informativos. Usa español latino neutro y sé muy breve.` }] }]
    };
    const r = await axios.post(urlIA, body);
    return r.data?.candidates?.[0]?.content?.parts?.[0]?.text || descripcion;
  } catch (error) { return `[REPORTE]: ${descripcion}`; }
}

async function charlaMisticaIA(userId, texto) {
  try {
    const urlIA = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`;
    
    // Filtramos solo los últimos 2 mensajes para velocidad
    const { data: recuerdos } = await supabase.from("memoria_ia").select("rol, contenido").eq("user_id", userId).order('id', { ascending: false }).limit(2);
    const contexto = recuerdos?.map(r => `${r.rol}: ${r.contenido}`).reverse().join("\n") || "";

    const prompt = `Eres el asistente del sistema AIFU. 
    INSTRUCCIONES:
    1. Responde en MÁXIMO 2 líneas.
    2. Usa español latino neutro (sin mística, sin poesía).
    3. Si te saludan, responde amablemente: "Hola, ¿en qué puedo ayudarte?".
    Contexto previo: ${contexto}
    Usuario: ${texto}`;

    const r = await axios.post(urlIA, { contents: [{ parts: [{ text: prompt }] }] });
    const respuesta = r.data?.candidates?.[0]?.content?.parts?.[0]?.text || "Sistema en espera.";
    
    // Guardado en segundo plano
    supabase.from("memoria_ia").insert([{ user_id: userId, rol: "user", contenido: texto }, { user_id: userId, rol: "model", contenido: respuesta }]).then();
    return respuesta;
  } catch (error) { return "Hola, ¿en qué puedo ayudarte?"; }
}

/* ==========================================
   🕹️ INTERFAZ Y FLUJO TÁCTICO
========================================== */

const menuPrincipal = Markup.keyboard([
  ["📍 Nuevo Reporte", "🛰️ Ver Radar"],
  ["🤖 Charla con Aifucito", "❌ Cancelar Operación"]
]).resize();

bot.start((ctx) => ctx.reply("SISTEMA AIFU ONLINE.\nSeleccione una opción para iniciar el monitoreo.", menuPrincipal));

bot.on("text", async (ctx) => {
  const userId = String(ctx.from.id);
  const state = userState.get(ctx.from.id);
  const texto = ctx.message.text;

  // PRIORIDADES DE COMANDOS
  if (texto === "❌ Cancelar Operación") {
    userState.delete(ctx.from.id);
    return ctx.reply("Operación cancelada. Regresando al menú.", menuPrincipal);
  }

  if (texto === "🛰️ Ver Radar") {
    return ctx.reply(`🌍 RADAR TÁCTICO EN VIVO:\n${process.env.PUBLIC_URL}`, menuPrincipal);
  }

  if (texto === "📍 Nuevo Reporte") {
    userState.set(ctx.from.id, { step: "ESPERANDO_GPS" });
    return ctx.reply("Por favor, envíe su ubicación GPS mediante el botón de Telegram:", 
      Markup.keyboard([[Markup.button.locationRequest("📍 ENVIAR MI POSICIÓN")]]).resize());
  }

  if (texto === "🤖 Charla con Aifucito") {
    userState.set(ctx.from.id, { step: "IA_MISTICA" });
    return ctx.reply("Hola, soy el asistente AIFU. ¿En qué información está interesado?");
  }

  // FLUJO DE REPORTE (ANÁLISIS Y ENVÍO)
  if (state?.step === "ESPERANDO_DESC") {
    ctx.reply("Analizando datos...");
    const informeIA = await procesarAvistamientoIA(texto);
    userState.set(ctx.from.id, { ...state, step: "CONFIRMAR", informe: informeIA });
    return ctx.reply(`📋 **INFORME TÉCNICO:**\n\n${informeIA}\n\n¿Confirmar transmisión al radar continental?`,
      Markup.keyboard([["✅ CONFIRMAR", "❌ Cancelar Operación"]]).resize());
  }

  if (texto === "✅ CONFIRMAR" && state?.step === "CONFIRMAR") {
    try {
      // INSERCIÓN CORREGIDA
      const { error } = await supabase.from("reportes").insert([
        {
          user_id: userId,
          lat: parseFloat(state.lat),
          lng: parseFloat(state.lng),
          descripcion: state.informe
        }
      ]);
      if (error) throw error;

      // LINK DE GOOGLE MAPS CORREGIDO (Sintaxis estándar)
      const mapaLink = `https://www.google.com/maps?q=${state.lat},${state.lng}`;
      
      await bot.telegram.sendMessage(CHANNEL_ID, `🚨 **ALERTA DE RADAR** 🚨\n\n${state.informe}\n\n📍 Ver ubicación: ${mapaLink}`);

      userState.delete(ctx.from.id);
      return ctx.reply("🚀 Transmisión exitosa. El reporte ya es visible en el radar.", menuPrincipal);
    } catch (err) { 
      return ctx.reply("❌ Error técnico al guardar en la base de datos."); 
    }
  }

  // MODO CHARLA (ASISTENTE NEUTRO)
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
  return ctx.reply("📍 Coordenadas recibidas. Describa brevemente lo observado:");
});

/* ==========================================
   🌐 SERVIDOR HTTP
========================================== */
app.use(express.static("public"));
app.get("/api/reportes", async (req, res) => {
  const { range } = req.query;
  let query = supabase.from("reportes").select("*").order("created_at", { ascending: false });
  if (range === "24h") query = query.gte("created_at", new Date(Date.now() - 86400000).toISOString());
  const { data } = await query;
  res.json(data || []);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ AIFU V12.9 ONLINE`);
  bot.launch();
});
