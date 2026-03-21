import "dotenv/config";
import { Telegraf, Markup, session } from "telegraf";
import express from "express";
import cors from "cors";
import axios from "axios";
import { createClient } from "@supabase/supabase-js";

/* =========================
   CONFIG
========================= */

const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const ADMIN_ID = process.env.ADMIN_ID;

const bot = new Telegraf(BOT_TOKEN);
const app = express();

app.use(cors());
app.use(express.json());

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

bot.use(session());

/* =========================
   RANGOS
========================= */

function obtenerRango(user) {
  if (String(user.id) === String(ADMIN_ID)) return "👑 Comandante Intergaláctico";
  if (user.rol === "colaborador") return "🛡️ Agente de Élite AIFU";

  const r = user.reportes || 0;

  if (r >= 20) return "casi te busca la CRIDOVNI";
  if (r >= 10) return "👽 Guardaespalda de Alf";
  if (r >= 5) return "🧉 Cebador de mate del Área 51";
  return "🧹 Fajinador de retretes espaciales";
}

/* =========================
   MENÚ
========================= */

function menu() {
  return Markup.keyboard([
    ["📍 Reportar"],
    ["🗺 Mapa"],
    ["🤖 Aifucito"],
    ["👤 Perfil"],
  ]).resize();
}

/* =========================
   USUARIO
========================= */

async function ensureUser(ctx) {
  const { from } = ctx;

  const { data } = await supabase
    .from("usuarios")
    .select("*")
    .eq("id", String(from.id))
    .single();

  if (!data) {
    await supabase.from("usuarios").insert([
      {
        id: String(from.id),
        nombre: from.username || from.first_name,
        rol: String(from.id) === String(ADMIN_ID) ? "admin" : "user",
        reportes: 0,
        created_at: new Date().toISOString(),
      },
    ]);
  }

  return data;
}

/* =========================
   REPORTES
========================= */

async function saveReport(ctx, report) {
  await supabase.from("reportes").insert([
    {
      user_id: String(ctx.from.id),
      lat: report.lat,
      lng: report.lng,
      tipo: report.tipo || "avistamiento",
      descripcion: report.descripcion,
      precision: report.precision || 1,
      pais: report.pais || "UY",
      created_at: new Date().toISOString(),
    },
  ]);

  const { data } = await supabase
    .from("usuarios")
    .select("reportes")
    .eq("id", String(ctx.from.id))
    .single();

  await supabase
    .from("usuarios")
    .update({ reportes: (data?.reportes || 0) + 1 })
    .eq("id", String(ctx.from.id));
}

/* =========================
   IA AIFUCITO
========================= */

const SYSTEM_PROMPT = `
Eres Aifucito, asistente del sistema AIFU en Uruguay.

Personalidad:
- simpático, alegre, conspiranoico divertido
- cómplice con el usuario
- estilo “expediente secreto”
- humor ligero

Contexto:
- CRIDOVNI (Fuerza Aérea Uruguaya)
- NASA
- CIA
- Hombres de Negro (referencia cultural)
- fenómenos aéreos no identificados

Reglas:
- puedes dejar entreabierta la idea de conspiracion
- tono divertido y narrativo
- lenguaje simple y cercano
`;

async function llamarGemini(prompt) {
  const API_KEY = process.env.GEMINI_API_KEY;

  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent";

  try {
    const res = await axios.post(
      url,
      {
        contents: [
          {
            parts: [{ text: SYSTEM_PROMPT + "\nUsuario: " + prompt }],
          },
        ],
      },
      { params: { key: API_KEY } }
    );

    return (
      res.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Sin señal desde Aifucito"
    );
  } catch {
    return "Error en la conexión con Aifucito";
  }
}

/* =========================
   START
========================= */

bot.start(async (ctx) => {
  await ensureUser(ctx);
  ctx.reply("aifucito activo", menu());
});

/* =========================
   IA BUTTON
========================= */

bot.hears("🤖 Aifucito", (ctx) => {
  ctx.session.mode = "ia";
  ctx.reply("consulta a Aifucito");
});

/* =========================
   PERFIL
========================= */

bot.hears("👤 Perfil", async (ctx) => {
  const { data } = await supabase
    .from("usuarios")
    .select("*")
    .eq("id", String(ctx.from.id))
    .single();

  const rango = obtenerRango(data || {});

  ctx.reply(
    `Perfil\n\nNombre: ${data?.nombre}\nReportes: ${data?.reportes}\nRango: ${rango}`
  );
});

/* =========================
   MAPA
========================= */

bot.hears("🗺 Mapa", (ctx) => {
  ctx.reply("Mapa activo", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Abrir mapa", url: "https://aifucito5-0.onrender.com" }],
      ],
    },
  });
});

/* =========================
   FLUJO GLOBAL
========================= */

bot.on("text", async (ctx) => {
  /* IA */
  if (ctx.session?.mode === "ia") {
    const res = await llamarGemini(ctx.message.text);
    ctx.reply(res);
    ctx.session.mode = null;
    return;
  }

  /* REPORTES SIMPLE (BASE) */
  if (ctx.message.text.includes(",")) {
    const [lat, lng] = ctx.message.text.split(",");

    ctx.session.lat = parseFloat(lat);
    ctx.session.lng = parseFloat(lng);
    ctx.session.step = "desc";

    return ctx.reply("Describe el fenómeno:");
  }

  if (ctx.session?.step === "desc") {
    await saveReport(ctx, {
      lat: ctx.session.lat,
      lng: ctx.session.lng,
      descripcion: ctx.message.text,
    });

    ctx.session = null;
    return ctx.reply("Reporte registrado");
  }
});

/* =========================
   API MAPA
========================= */

app.get("/api/reports", async (req, res) => {
  const { data } = await supabase.from("reportes").select("*");
  res.json(data);
});

app.listen(3000);

bot.launch();
console.log("AIFUCITO ONLINE");
