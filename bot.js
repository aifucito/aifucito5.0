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

const STATE = {
  IDLE: "idle",
  WAIT_GPS: "wait_gps",
  WAIT_DESC: "wait_desc",
  IA: "ia"
};

const CHANNELS = {
  UY: process.env.CHANNEL_UY,
  AR: process.env.CHANNEL_AR,
  CL: process.env.CHANNEL_CL
};

/* =========================
   SERVIDOR WEB (API & RADAR)
========================= */
app.use(express.static(path.join(process.cwd(), "public")));

app.get("/api/reports", async (req, res) => {
  try {
    const { data } = await supabase
      .from("reportes")
      .select("*")
      .order("created_at", { ascending: false });
    res.json(data || []);
  } catch (e) {
    console.error("❌ API ERROR:", e.message);
    res.json([]);
  }
});

app.listen(process.env.PORT || 3000, "0.0.0.0");

/* =========================
   SESIÓN PERSISTENTE (REFORZADA)
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

    // Guardado post-acción para asegurar persistencia
    await supabase.from("sesiones").upsert({
      id,
      data: ctx.session,
      updated_at: new Date()
    });

  } catch (e) {
    console.log("⚠️ SESSION ERROR:", e.message);
    ctx.session = { state: STATE.IDLE };
    await next();
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

function rango(r = 0, id = "") {
  if (String(id) === ADMIN_ID) return "👑 Comandante";
  if (r >= 25) return "🛸 CRIDOVNI";
  if (r >= 10) return "🛰️ Agente OVNI";
  if (r >= 5) return "🧉 Investigador";
  return "🔭 Observador";
}

async function reverseGeo(lat, lng) {
  try {
    const r = await axios.get("https://nominatim.openstreetmap.org/reverse", {
      params: { format: "json", lat, lon: lng },
      timeout: 5000
    });

    const a = r.data?.address || {};
    return {
      pais: a.country_code?.toUpperCase() || "GLOBAL",
      ciudad: a.city || a.town || "Zona desconocida"
    };
  } catch {
    return { pais: "GLOBAL", ciudad: "Zona desconocida" };
  }
}

/* =========================
   COMANDOS INICIALES
========================= */
bot.start(async (ctx) => {
  await supabase.from("usuarios").upsert({
    id: String(ctx.from.id),
    nombre: ctx.from.first_name
  });

  ctx.session.state = STATE.IDLE;

  return ctx.reply("🛸 Sistema AIFU activo. Bienvenido a bordo.", {
    reply_markup: menu().reply_markup
  });
});

/* =========================
   PERFIL & MAPA
========================= */
bot.hears("👤 Perfil", async (ctx) => {
  const { data } = await supabase
    .from("usuarios")
    .select("*")
    .eq("id", String(ctx.from.id))
    .maybeSingle();

  return ctx.reply(
    `👤 **NOMBRE:** ${data?.nombre}\n📊 **REPORTES:** ${data?.reportes || 0}\n🎖 **RANGO:** ${rango(data?.reportes, ctx.from.id)}`,
    { parse_mode: "Markdown", reply_markup: menu().reply_markup }
  );
});

bot.hears("🗺 Mapa", (ctx) => {
  return ctx.reply("🌐 **RADAR EN VIVO:**", {
    reply_markup: {
      inline_keyboard: [[
        { text: "🛰️ Abrir mapa", url: "https://aifucito5-0.onrender.com" }
      ]]
    }
  });
});

/* =========================
   SISTEMA DE TEXTO & IA
========================= */
bot.hears("🤖 Aifucito", (ctx) => {
  ctx.session.state = STATE.IA;
  return ctx.reply("🤖 **IA ACTIVA.** ¿Qué anomalía quieres discutir?");
});

bot.on("text", async (ctx) => {
  const text = ctx.message.text;

  if (text === "❌ Cancelar") {
    ctx.session.state = STATE.IDLE;
    return ctx.reply("🚫 Operación cancelada", { reply_markup: menu().reply_markup });
  }

  // MANEJO DE IA
  if (ctx.session.state === STATE.IA) {
    ctx.session.state = STATE.IDLE;
    // Aquí puedes integrar tu llamada a Gemini si lo deseas, por ahora fallback estable
    return ctx.reply("👽 **AIFUCITO:** Recibido, Agente. Procesando datos estelares...", {
      reply_markup: menu().reply_markup
    });
  }

  // MANEJO DE DESCRIPCIÓN (REPORTE)
  if (ctx.session.state === STATE.WAIT_DESC) {
    if (!ctx.session.lat) {
      ctx.session.state = STATE.IDLE;
      return ctx.reply("⚠️ Error de sesión: Coordenadas perdidas. Reiniciá el reporte.", {
        reply_markup: menu().reply_markup
      });
    }

    if (text.length < 10) return ctx.reply("✍️ Por favor, danos más detalles (mín. 10 caracteres).");

    try {
      await supabase.from("reportes").insert([{
        user_id: String(ctx.from.id),
        lat: ctx.session.lat,
        lng: ctx.session.lng,
        descripcion: text,
        pais: ctx.session.pais || "GLOBAL"
      }]);

      const { data: u } = await supabase.from("usuarios").select("reportes").eq("id", String(ctx.from.id)).maybeSingle();
      const total = (u?.reportes || 0) + 1;
      await supabase.from("usuarios").upsert({ id: String(ctx.from.id), nombre: ctx.from.first_name, reportes: total });

      ctx.session.state = STATE.IDLE;
      return ctx.reply(`✅ **REPORTE GUARDADO.**\n🎖 **Rango:** ${rango(total, ctx.from.id)}`, {
        reply_markup: menu().reply_markup
      });
    } catch (e) {
      console.log("Error guardando reporte:", e.message);
      return ctx.reply("❌ Error al guardar en base de datos.");
    }
  }
});

/* =========================
   FLUJO DE REPORTE (GPS)
========================= */
bot.hears("📍 Reportar", (ctx) => {
  ctx.session = { state: STATE.WAIT_GPS };

  return ctx.reply("📡 **ENVIÁ TU UBICACIÓN GPS:**", {
    reply_markup: Markup.keyboard([
      [{ text: "📍 Enviar mi ubicación", request_location: true }],
      ["❌ Cancelar"]
    ]).resize().oneTime().reply_markup
  });
});

/* GPS (CLAVE DE ESTABILIDAD) */
bot.on("location", async (ctx) => {
  console.log("📍 GPS recibido del usuario", ctx.from.id);

  if (ctx.session.state !== STATE.WAIT_GPS) {
    console.log("⚠️ Intento de GPS fuera de estado:", ctx.session.state);
    return;
  }

  try {
    ctx.session.lat = ctx.message.location.latitude;
    ctx.session.lng = ctx.message.location.longitude;

    const geo = await reverseGeo(ctx.session.lat, ctx.session.lng);
    ctx.session.pais = geo.pais;
    ctx.session.state = STATE.WAIT_DESC;

    await ctx.reply(`📍 **UBICACIÓN CAPTURADA:**\n${geo.ciudad} (${geo.pais})`);

    // Separamos el remove_keyboard para evitar bugs visuales (Ajuste 2)
    return ctx.reply(
      "✍️ **DESCRIBÍ LO QUE VISTE:**",
      { reply_markup: { remove_keyboard: true } }
    );
  } catch (e) {
    console.error("Error procesando GPS:", e);
    return ctx.reply("❌ Error procesando coordenadas.");
  }
});

/* =========================
   ERRORES & ESTABILIDAD
========================= */
bot.catch((err) => {
  console.log("🔥 ERROR GLOBAL:", err);
});

bot.launch({ dropPendingUpdates: true });

// Heartbeat para Render (Ajuste 4)
setInterval(() => {
  console.log("🟢 [HEARTBEAT] Bot activo:", new Date().toLocaleTimeString());
}, 300000);

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

console.log("🚀 RED AIFU V6.0: PROTOCOLO FINAL BLINDADO");
