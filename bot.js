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
   🧠 NÚCLEO DE INTELIGENCIA (ANALISTA PROFESIONAL)
========================================== */

async function procesarAvistamientoIA(descripcion) {
  try {
    const urlIA = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const body = {
      contents: [{ parts: [{ text: `Actúa como un experto analista de radares. Analiza: "${descripcion}". Clasifica el fenómeno y redacta un informe técnico breve y profesional. Usa español latino neutro y emojis informativos.` }] }]
    };
    const r = await axios.post(urlIA, body);
    return r.data?.candidates?.[0]?.content?.parts?.[0]?.text || descripcion;
  } catch (error) { return `[INFORME TÉCNICO]: ${descripcion}`; }
}

async function charlaMisticaIA(userId, texto) {
  try {
    const urlIA = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`;
    
    const prompt = `Eres el asistente oficial del sistema AIFU.
    REGLAS:
    1. Usa español latino neutro y tono profesional.
    2. Responde de forma clara y coherente (entre 2 y 4 líneas).
    3. Si te saludan, preséntate como el asistente del radar y ofrece ayuda con los reportes.
    4. Evita el lenguaje poético o místico excesivo.
    Usuario dice: ${texto}`;

    const r = await axios.post(urlIA, { contents: [{ parts: [{ text: prompt }] }] });
    const respuesta = r.data?.candidates?.[0]?.content?.parts?.[0]?.text || "Sistema en línea. ¿En qué puedo ayudarle?";
    
    // Guardado en segundo plano
    supabase.from("memoria_ia").insert([{ user_id: userId, rol: "user", contenido: texto }, { user_id: userId, rol: "model", contenido: respuesta }]).then();
    return respuesta;
  } catch (error) { return "Hola. Soy el asistente de AIFU, ¿en qué puedo ayudarle con el radar hoy?"; }
}

/* ==========================================
   🕹️ INTERFAZ Y FLUJO TÁCTICO
========================================== */

const menuPrincipal = Markup.keyboard([
  ["📍 Nuevo Reporte", "🛰️ Ver Radar"],
  ["🤖 Charla con Aifucito", "❌ Cancelar Operación"]
]).resize();

bot.start((ctx) => ctx.reply("SISTEMA AIFU ONLINE.\nPlataforma de vigilancia activa del Cono Sur.", menuPrincipal));

bot.on("text", async (ctx) => {
  const userId = String(ctx.from.id);
  const state = userState.get(ctx.from.id);
  const texto = ctx.message.text;

  if (texto === "❌ Cancelar Operación") {
    userState.delete(ctx.from.id);
    return ctx.reply("Operación cancelada. Regresando al menú principal.", menuPrincipal);
  }

  if (texto === "🛰️ Ver Radar") {
    return ctx.reply(`🌍 RADAR TÁCTICO EN VIVO:\n${process.env.PUBLIC_URL}`, menuPrincipal);
  }

  if (texto === "📍 Nuevo Reporte") {
    userState.set(ctx.from.id, { step: "ESPERANDO_GPS" });
    return ctx.reply("📡 INICIANDO PROTOCOLO:\nPor favor, envíe su ubicación GPS mediante el botón de Telegram:", 
      Markup.keyboard([[Markup.button.locationRequest("📍 ENVIAR MI POSICIÓN")]]).resize());
  }

  if (texto === "🤖 Charla con Aifucito") {
    userState.set(ctx.from.id, { step: "IA_MISTICA" });
    return ctx.reply("Sistema de consulta activado. ¿Qué información necesita?");
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
      // REGISTRO AUTOMÁTICO DE USUARIO (Para evitar error de Foreign Key)
      await supabase.from("sessions").upsert({ user_id: userId, state: 'IDLE' }, { onConflict: 'user_id' });

      // INSERCIÓN DEL REPORTE
      const { error } = await supabase.from("reportes").insert([
        {
          user_id: userId,
          lat: parseFloat(state.lat),
          lng: parseFloat(state.lng),
          descripcion: state.informe
        }
      ]);
      if (error) throw error;

      // LINK CORREGIDO
      const mapaLink = `https://www.google.com/maps?q=${state.lat},${state.lng}`;
      
      await bot.telegram.sendMessage(CHANNEL_ID, `🚨 **AVISTAMIENTO REGISTRADO** 🚨\n\n${state.informe}\n\n📍 Ver en mapa: ${mapaLink}`);

      userState.delete(ctx.from.id);
      return ctx.reply("🚀 Transmisión exitosa. Los datos ya son visibles en el radar.", menuPrincipal);
    } catch (err) { 
      console.error("Error SQL:", err.message);
      return ctx.reply("❌ Error técnico al guardar. Intente nuevamente."); 
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
  console.log(`✅ AIFU V13.1 ONLINE`);
  bot.launch();
});
