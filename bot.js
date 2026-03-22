import "dotenv/config";
import { Telegraf, Markup } from "telegraf";
import axios from "axios";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import path from "path";

/* =========================
    CONFIGURACIÓN DE NÚCLEO
========================= */
const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const ADMIN_ID = String(process.env.ADMIN_ID);

const app = express();

/* =========================
    SERVIDOR WEB (RADAR TÁCTICO)
========================= */
app.use(express.static(path.join(process.cwd(), "public")));

// API para que el mapa lea los reportes en tiempo real
app.get("/api/reports", async (req, res) => {
  try {
    const { data } = await supabase.from("reportes").select("*");
    res.json(data || []);
  } catch (e) {
    res.json([]);
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

app.listen(process.env.PORT || 3000, "0.0.0.0");

const STATE = {
  IDLE: "idle",
  WAIT_GPS: "wait_gps",
  WAIT_DESC: "wait_desc",
  IA: "ia",
  CONFIRM: "confirm"
};

/* =========================
    SESIÓN PERSISTENTE (TABLA SESIONES)
========================= */
bot.use(async (ctx, next) => {
  if (!ctx.from) return next();
  const id = String(ctx.from.id);

  try {
    const { data } = await supabase
      .from("sesiones")
      .select("data")
      .eq("id", id)
      .maybeSingle();

    ctx.session = data?.data || { state: STATE.IDLE };

    await next();

    // Guardado automático al finalizar el turno
    await supabase.from("sesiones").upsert({
      id,
      data: ctx.session,
      updated_at: new Date()
    });
  } catch (error) {
    console.error("Error en enlace de sesión:", error);
    return next();
  }
});

/* =========================
    UTILIDADES & RANGOS
========================= */
function menu() {
  return Markup.keyboard([
    ["📍 Reportar"],
    ["🗺 Mapa"],
    ["🤖 Aifucito", "👤 Perfil"]
  ]).resize();
}

function obtenerRango(r = 0, id = "") {
  if (String(id) === ADMIN_ID) return "👑 Comandante Intergaláctico";
  if (r >= 25) return "🛸 CRIDOVNI";
  if (r >= 15) return "🛡️ Guardaespaldas de Alf";
  if (r >= 10) return "🛰️ Guardaespaldas OVNI";
  if (r >= 5) return "🧉 Cebador del mate del Área 51";
  if (r >= 2) return "🧹 Fajinador de retretes espaciales";
  return "🔭 Observador inicial";
}

/* =========================
    NÚCLEO IA (GEMINI)
========================= */
async function consultarIA(text) {
  try {
    const prompt = `Actúa como AIFUCITO, la IA táctica de la Red AIFU. Responde de forma técnica y futurista: ${text}`;

    const r = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: prompt }] }] },
      { timeout: 10000 }
    );

    return (
      r.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "⚠️ Módulo de voz offline."
    );
  } catch {
    return "❌ Error en el enlace neuronal.";
  }
}

/* =========================
    GEOPOSICIONAMIENTO
========================= */
async function reverseGeo(lat, lng) {
  try {
    const r = await axios.get("https://nominatim.openstreetmap.org/reverse", {
      params: { format: "json", lat, lon: lng },
      headers: { "User-Agent": "AIFUCITO_V5" }
    });

    const a = r.data?.address || {};
    return {
      pais: a.country_code?.toUpperCase() || "GLOBAL",
      ciudad: a.city || a.town || a.village || "Desconocido"
    };
  } catch {
    return { pais: "GLOBAL", ciudad: "N/A" };
  }
}

/* =========================
    ALERTAS A CANALES
========================= */
async function enviarAlerta(msg) {
  const channel = process.env.CHANNEL_CONO_SUR;
  if (channel) {
    await bot.telegram.sendMessage(channel, `🚨 **ALERTA AIFU**\n${msg}`, { parse_mode: "Markdown" }).catch(() => {});
  }
}

/* =========================
    COMANDO START
========================= */
bot.start(async (ctx) => {
  const id = String(ctx.from.id);

  await supabase.from("usuarios").upsert({
    id,
    nombre: ctx.from.first_name,
    rol: id === ADMIN_ID ? "admin" : "user"
  });

  ctx.session.state = STATE.IDLE;
  ctx.reply("🛸 **SISTEMA AIFU ONLINE**\nBienvenido al centro de mando operativo.", menu());
});

/* =========================
    PERFIL DE AGENTE
========================= */
bot.hears("👤 Perfil", async (ctx) => {
  const { data } = await supabase
    .from("usuarios")
    .select("*")
    .eq("id", String(ctx.from.id))
    .maybeSingle();

  const nivel = obtenerRango(data?.reportes || 0, ctx.from.id);

  ctx.reply(
    `👤 **Agente:** ${data?.nombre}\n📑 **Reportes:** ${data?.reportes || 0}\n🎖️ **Rango:** ${nivel}`,
    { parse_mode: "Markdown" }
  );
});

/* =========================
    ACCESO AL MAPA
========================= */
bot.hears("🗺 Mapa", (ctx) => {
  ctx.reply("🌐 Accediendo al Radar Táctico Global...", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🛰️ Abrir Mapa en Vivo", url: "https://aifucito5-0.onrender.com" }]
      ]
    }
  });
});

/* =========================
    PROTOCOLO DE REPORTE
========================= */
bot.hears("📍 Reportar", (ctx) => {
  ctx.session.state = STATE.WAIT_GPS;
  ctx.reply(
    "📡 **Protocolo de Avistamiento**: Envía tu posición GPS para iniciar la triangulación.",
    Markup.keyboard([
      [{ text: "📡 Enviar Posición GPS", request_location: true }],
      ["❌ Cancelar"]
    ]).resize().oneTime()
  );
});

/* =========================
    RECEPCIÓN DE COORDENADAS
========================= */
bot.on("location", (ctx) => {
  if (ctx.session.state !== STATE.WAIT_GPS) return;

  ctx.session.lat = ctx.message.location.latitude;
  ctx.session.lng = ctx.message.location.longitude;
  ctx.session.state = STATE.WAIT_DESC;

  ctx.reply("📥 Coordenadas fijadas. Describe el evento (mín. 20 carac.):", Markup.removeKeyboard());
});

/* =========================
    FLUJO DE TEXTO & IA
========================= */
bot.on("text", async (ctx) => {
  const text = ctx.message.text;

  if (text === "❌ Cancelar") {
    ctx.session.state = STATE.IDLE;
    return ctx.reply("Operación abortada.", menu());
  }

  if (ctx.session.state === STATE.IA) {
    const r = await consultarIA(text);
    ctx.session.state = STATE.IDLE;
    return ctx.reply(`🤖 **AIFUCITO:** ${r}`, { parse_mode: "Markdown" });
  }

  if (ctx.session.state === STATE.WAIT_DESC) {
    if (text.length < 20) return ctx.reply("⚠️ Telemetría insuficiente. Aporta más detalles.");

    const geo = await reverseGeo(ctx.session.lat, ctx.session.lng);

    ctx.session.pending = {
      lat: ctx.session.lat,
      lng: ctx.session.lng,
      desc: text,
      pais: geo.pais,
      ciudad: geo.ciudad
    };

    ctx.session.state = STATE.CONFIRM;

    return ctx.reply(
      `📝 **DATOS DEL AVISTAMIENTO**\n📍 **Lugar:** ${geo.ciudad}, ${geo.pais}\n💬 **Relato:** ${text}\n\n¿Confirmas la transmisión?`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "✔ Confirmar Transmisión", callback_data: `ok:${ctx.from.id}` }],
            [{ text: "✖ Abortar", callback_data: `no:${ctx.from.id}` }]
          ]
        }
      }
    );
  }
});

/* =========================
    CONFIRMACIÓN (CALLBACK OK)
========================= */
bot.action(/^ok:(\d+)$/, async (ctx) => {
  const userId = ctx.match[1];
  if (String(ctx.from.id) !== userId) return ctx.answerCbQuery("⚠️ No autorizado.");
  
  const r = ctx.session.pending;
  if (!r) return ctx.answerCbQuery("Datos no encontrados.");

  try {
    // 1. Insertar reporte
    await supabase.from("reportes").insert([{
      user_id: userId,
      lat: r.lat,
      lng: r.lng,
      descripcion: r.desc,
      pais: r.pais
    }]);

    // 2. Incrementar reportes en perfil
    const { data: u } = await supabase.from("usuarios").select("reportes").eq("id", userId).single();
    const nuevosReportes = (u?.reportes || 0) + 1;
    await supabase.from("usuarios").update({ reportes: nuevosReportes }).eq("id", userId);

    // 3. Alerta global
    await enviarAlerta(`📍 *${r.ciudad}, ${r.pais}*\nActividad detectada por un ${obtenerRango(nuevosReportes, userId)}.`);

    ctx.session.state = STATE.IDLE;
    ctx.session.pending = null;

    ctx.reply(`✅ **REPORTE INDEXADO**\nTu rango actual: ${obtenerRango(nuevosReportes, userId)}`, menu());
  } catch (e) {
    ctx.reply("❌ Error crítico en la transmisión.");
  }
});

/* =========================
    CANCELACIÓN (CALLBACK NO)
========================= */
bot.action(/^no:(\d+)$/, async (ctx) => {
  if (String(ctx.from.id) !== ctx.match[1]) return ctx.answerCbQuery("⚠️ Acción bloqueada.");
  ctx.session.state = STATE.IDLE;
  ctx.session.pending = null;
  ctx.reply("Datos eliminados de la memoria temporal.", menu());
});

/* =========================
    MODO IA
========================= */
bot.hears("🤖 Aifucito", (ctx) => {
  ctx.session.state = STATE.IA;
  ctx.reply("🤖 **AIFUCITO V5.0**\nEstableciendo enlace neuronal... ¿Qué deseas consultar?");
});

/* =========================
    IGNICIÓN
========================= */
bot.launch();
console.log("🚀 RED AIFU V5.0: OPERATIVA Y BLINDADA");
