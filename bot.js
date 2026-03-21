import "dotenv/config";
import { Telegraf, Markup, session } from "telegraf";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

/* ===============================
    CONFIGURACIÓN
================================ */
const TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = "7662736311";

const RADAR_CONO_SUR = -1002447915570;
const BACKUP_CANAL = -1003895765674;

const WEBAPP_URL = "https://aifucito5-0.onrender.com";

/* ===============================
    SUPABASE
================================ */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

/* ===============================
    INICIALIZACIÓN
================================ */
const bot = new Telegraf(TOKEN);
bot.use(session());

// FIX sesión segura
bot.use((ctx, next) => {
  if (!ctx.session) ctx.session = {};
  return next();
});

const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

/* ===============================
    BASE LOCAL (BACKUP)
================================ */
const DB_FILE = "usuarios.json";
const LOG_FILE = "public/reportes.json";

let usuarios = fs.existsSync(DB_FILE)
  ? JSON.parse(fs.readFileSync(DB_FILE))
  : {};

function save() {
  fs.writeFileSync(DB_FILE, JSON.stringify(usuarios, null, 2));
}

function getUser(id, name = "Desconocido") {
  if (!usuarios[id]) {
    usuarios[id] = {
      nombre: name,
      reportes: 0,
      rol: "gratis",
      pais: null,
      expira: 0
    };
  }
  if (id == ADMIN_ID) usuarios[id].rol = "admin";
  return usuarios[id];
}

/* ===============================
    SUPABASE USER
================================ */
async function getUserDB(id, name) {
  let { data: user } = await supabase
    .from("usuarios")
    .select("*")
    .eq("id", id.toString())
    .single();

  if (!user) {
    const { data: newUser } = await supabase
      .from("usuarios")
      .insert({
        id: id.toString(),
        nombre: name,
        rol: id.toString() === ADMIN_ID ? "admin" : "gratis",
        reportes: 0
      })
      .select()
      .single();

    return newUser;
  }

  return user;
}

/* ===============================
    RANGOS
================================ */
function obtenerRango(user) {
  if (user.rol === "admin") return "👑 Comandante Intergaláctico";
  if (user.rol === "colaborador") return "🛡️ Agente de Élite AIFU";

  const r = user.reportes;
  if (r >= 20) return "casi te busca la CRIDOVNI";
  if (r >= 10) return "👽 Guardaespalda de Alf";
  if (r >= 5) return "🧉 Cebador de mate del Área 51";
  return "🧹 Fajinador de retretes espaciales";
}

function detectarPais(lat, lon) {
  if (lat < -30 && lat > -35 && lon < -53 && lon > -58) return "🇺🇾 Uruguay";
  if (lat < -22 && lat > -55 && lon < -53 && lon > -73) return "🇦🇷 Argentina";
  if (lat < -17 && lat > -56 && lon < -66 && lon > -75) return "🇨🇱 Chile";
  return "🌎 Global";
}

/* ===============================
    TEST DB
================================ */
bot.command("testdb", async (ctx) => {
  const { error } = await supabase.from("usuarios").insert({
    id: ctx.from.id.toString(),
    nombre: ctx.from.first_name,
    rol: "test",
    reportes: 0
  });

  if (error) return ctx.reply("❌ Error Supabase");
  ctx.reply("✅ Supabase funcionando");
});

/* ===============================
    START
================================ */
bot.start((ctx) => {
  if (ctx.chat.type !== "private") return;

  ctx.reply(
    "🛰️ HOLA! SOY AIFUCITO...",
    Markup.keyboard([
      [Markup.button.locationRequest("📍 Enviar ubicación")],
      ["📡 Reportar", "📊 Ver reportes"],
      ["👤 Perfil", "🗺️ Ver mapa"]
    ]).resize()
  );
});

/* ===============================
    FLUJO PRO
================================ */

// Paso 1: tipo
bot.hears("📡 Reportar", (ctx) => {
  ctx.session.step = "tipo";

  ctx.reply(
    "🛸 ¿Qué tipo de avistamiento viste?",
    Markup.keyboard([
      ["💡 Luz", "🛸 Objeto"],
      ["👤 Entidad", "❓ Otro"]
    ]).resize()
  );
});

// Paso 2: guardar tipo
bot.hears(["💡 Luz", "🛸 Objeto", "👤 Entidad", "❓ Otro"], (ctx) => {
  if (ctx.session.step !== "tipo") return;

  ctx.session.tipo = ctx.message.text;
  ctx.session.step = "descripcion";

  ctx.reply("✍️ Describí lo que viste:");
});

// Paso 3: descripción
bot.on("text", (ctx, next) => {
  if (ctx.session.step === "descripcion") {
    ctx.session.descripcion = ctx.message.text;
    ctx.session.step = "ubicacion";

    return ctx.reply(
      "📍 Ahora enviá tu ubicación",
      Markup.keyboard([
        [Markup.button.locationRequest("📍 Enviar ubicación")]
      ]).resize()
    );
  }
  return next();
});

/* ===============================
    UBICACIÓN PRO
================================ */
bot.on("location", async (ctx) => {
  const localUser = getUser(ctx.from.id, ctx.from.first_name);
  const dbUser = await getUserDB(ctx.from.id, ctx.from.first_name);

  const { latitude, longitude, accuracy } = ctx.message.location;

  const tipo = ctx.session.tipo || "No especificado";
  const descripcion = ctx.session.descripcion || "Sin descripción";
  const pais = detectarPais(latitude, longitude);

  // LOCAL
  localUser.reportes++;
  if (!localUser.pais) localUser.pais = pais;
  save();

  // SUPABASE
  await supabase
    .from("usuarios")
    .update({ reportes: dbUser.reportes + 1 })
    .eq("id", ctx.from.id.toString());

  const data = {
    lat: latitude,
    lng: longitude,
    user: ctx.from.first_name,
    rango: obtenerRango(dbUser),
    tipo,
    descripcion,
    precision: accuracy || 0,
    pais,
    ts: Date.now()
  };

  // DB
  await supabase.from("reportes").insert({
    user_id: ctx.from.id.toString(),
    lat: latitude,
    lng: longitude,
    rango: data.rango,
    tipo: data.tipo,
    descripcion: data.descripcion,
    precision: data.precision,
    pais: data.pais
  });

  // RADAR
  const texto = `🛸 AVISTAMIENTO

👤 ${data.user}
🎖️ ${data.rango}
📌 Tipo: ${data.tipo}
📝 ${data.descripcion}
📍 ${data.lat}, ${data.lng}
🎯 Precisión: ${data.precision}m
🌎 ${data.pais}`;

  await ctx.telegram.sendMessage(RADAR_CONO_SUR, texto);
  await ctx.telegram.sendMessage(BACKUP_CANAL, JSON.stringify(data));

  // BACKUP LOCAL
  let reportes = fs.existsSync(LOG_FILE)
    ? JSON.parse(fs.readFileSync(LOG_FILE))
    : [];

  reportes.push(data);
  fs.writeFileSync(LOG_FILE, JSON.stringify(reportes, null, 2));

  ctx.session = {};

  ctx.reply("✅ Reporte completo enviado");
});

/* ===============================
    PERFIL
================================ */
bot.hears("👤 Perfil", async (ctx) => {
  const user = await getUserDB(ctx.from.id);

  ctx.reply(
`🧾 EXPEDIENTE AIFU

🎖️ Rango: ${obtenerRango(user)}
📊 Avistamientos: ${user.reportes}
💳 Estado: ${user.rol.toUpperCase()}`
  );
});

/* ===============================
    MAPA
================================ */
bot.hears("🗺️ Ver mapa", (ctx) => {
  ctx.reply(
    "🔭 Abriendo Radar...",
    Markup.inlineKeyboard([
      Markup.button.webApp("🛰️ Ver mapa", WEBAPP_URL)
    ])
  );
});

/* ===============================
    ERRORES
================================ */
bot.catch((err) => {
  console.error("🔥 ERROR:", err);
});

/* ===============================
    SERVIDOR
================================ */
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html"))
);

(async () => {
  console.log("🚀 AIFU OS Operativo");
  bot.launch({ dropPendingUpdates: true });
  app.listen(process.env.PORT || 3000);
})();
