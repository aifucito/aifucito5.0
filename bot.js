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
   🧠 IA AIFU
========================================== */

async function procesarAvistamientoIA(descripcion) {
  try {
    const urlIA = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const body = {
      contents: [{ parts: [{ text: `Actúa como analista de radar experto de AIFU. Analiza: "${descripcion}". Devuelve un informe técnico de MÁXIMO 4 líneas.` }] }]
    };
    const r = await axios.post(urlIA, body);
    return r.data?.candidates?.[0]?.content?.parts?.[0]?.text || descripcion;
  } catch {
    return `[INFORME AIFU]: ${descripcion}`;
  }
}

async function charlaMisticaIA(userId, texto) {
  try {
    const urlIA = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const prompt = `Eres Aifucito, asistente técnico del sistema AIFU. Usuario: ${texto}`;
    const r = await axios.post(urlIA, { contents: [{ parts: [{ text: prompt }] }] });
    const respuesta = r.data?.candidates?.[0]?.content?.parts?.[0]?.text || "Sistema activo.";

    supabase.from("memoria_ia").insert([
      { user_id: userId, rol: "user", contenido: texto },
      { user_id: userId, rol: "model", contenido: respuesta }
    ]).then();

    return respuesta;
  } catch {
    return "Sistema activo.";
  }
}

/* ==========================================
   🕹️ INTERFAZ
========================================== */

const menuPrincipal = Markup.keyboard([
  ["📍 Nuevo Reporte", "🛰️ Ver Radar"],
  ["🤖 Charla con Aifucito", "❌ Cancelar Operación"]
]).resize();

bot.start((ctx) => ctx.reply("SISTEMA AIFU ONLINE.", menuPrincipal));

bot.on("text", async (ctx) => {
  const userId = String(ctx.from.id);
  const state = userState.get(ctx.from.id);
  const texto = ctx.message.text;

  if (texto === "❌ Cancelar Operación") {
    userState.delete(ctx.from.id);
    return ctx.reply("Operación cancelada.", menuPrincipal);
  }

  if (texto === "🛰️ Ver Radar") {
    return ctx.reply(`🌍 RADAR EN VIVO:\n${process.env.PUBLIC_URL}`, menuPrincipal);
  }

  if (texto === "📍 Nuevo Reporte") {
    userState.set(ctx.from.id, { step: "ESPERANDO_GPS" });
    return ctx.reply("Envíe su ubicación:",
      Markup.keyboard([[Markup.button.locationRequest("📍 ENVIAR MI POSICIÓN")]]).resize());
  }

  if (texto === "🤖 Charla con Aifucito") {
    userState.set(ctx.from.id, { step: "IA_MISTICA" });
    return ctx.reply("Aifucito activo.");
  }

  if (state?.step === "ESPERANDO_DESC") {
    ctx.reply("Analizando...");
    const informeIA = await procesarAvistamientoIA(texto);
    userState.set(ctx.from.id, { ...state, step: "CONFIRMAR", informe: informeIA });

    return ctx.reply(`📋 INFORME:\n${informeIA}\n\n¿Confirmar envío?`,
      Markup.keyboard([["✅ CONFIRMAR", "❌ Cancelar Operación"]]).resize());
  }

  if (texto === "✅ CONFIRMAR" && state?.step === "CONFIRMAR") {
    try {
      await supabase.from("reportes").insert([{
        user_id: userId,
        lat: parseFloat(state.lat),
        lng: parseFloat(state.lng),
        descripcion: state.informe
      }]);

      const mapaLink = `${process.env.PUBLIC_URL}/?lat=${state.lat}&lng=${state.lng}`;

      await bot.telegram.sendMessage(CHANNEL_ID,
        `🚨 NUEVO REPORTE AIFU\n\n${state.informe}\n\n📍 ${mapaLink}`);

      userState.delete(ctx.from.id);
      return ctx.reply("Reporte enviado correctamente.", menuPrincipal);

    } catch (err) {
      console.error(err);
      return ctx.reply("Error al guardar reporte.");
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

  return ctx.reply("Ubicación recibida. Describe el evento:");
});

/* ==========================================
   🌍 API RADAR (ARREGLADA)
========================================== */

app.use(express.static("public"));

app.get("/api/reportes", async (req, res) => {
  try {
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("reportes")
      .select("*")
      .gte("created_at", hace24h)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    // evitar cache
    res.set("Cache-Control", "no-store");

    res.json(data || []);

  } catch (err) {
    console.error("Error API:", err.message);
    res.status(500).json({ error: "Error obteniendo reportes" });
  }
});

/* ==========================================
   🚀 SERVIDOR
========================================== */

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ AIFU RADAR ACTIVO`);
  bot.launch();
});
