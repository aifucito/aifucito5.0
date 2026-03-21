import "dotenv/config";
import { Telegraf, Markup, session } from "telegraf";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

/* ===============================
    CONFIGURACIÓN TÁCTICA
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

const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

/* ===============================
    BASE LOCAL (se mantiene por ahora)
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
    RANGOS
================================ */
function obtenerRango(user) {
  if (user.rol === "admin") return "👑 Comandante Intergaláctico";
  if (user.rol === "colaborador") return "🛡️ Agente de Élite AIFU";

  const r = user.reportes;
  if (r >= 20) return "👽 Guardaespalda de Alf";
  if (r >= 10) return "🧉 Cebador de mate del Área 51";
  if (r >= 5) return "🧹 Fajinador de retretes espaciales";
  return "🛰️ Recluta Civil";
}

/* ===============================
    TEST SUPABASE (NUEVO)
================================ */
bot.command("testdb", async (ctx) => {
  console.log("🧪 Ejecutando testdb");

  const { data, error } = await supabase
    .from("usuarios")
    .insert({
      id: ctx.from.id.toString(),
      nombre: ctx.from.first_name,
      rol: "test",
      reportes: 0
    });

  if (error) {
    console.error("❌ Supabase error:", error);
    return ctx.reply("❌ Error conectando con Supabase");
  }

  ctx.reply("✅ Supabase conectado correctamente");
});

/* ===============================
    DEBUG (NUEVO - TEMPORAL)
================================ */
bot.on("text", (ctx, next) => {
  console.log("📨 Mensaje:", ctx.message.text);
  return next();
});

/* ===============================
    BOT
================================ */
bot.start((ctx) => {
  if (ctx.chat.type !== "private") return;
  ctx.reply(
    "🛰️ AIFU activo... Hablá bajo...",
    Markup.keyboard([
      ["📡 Reportar", "📊 Ver reportes"],
      ["👤 Perfil", "🗺️ Ver mapa"]
    ]).resize()
  );
});

bot.hears("📡 Reportar", (ctx) =>
  ctx.reply("📍 Enviá tu ubicación por GPS...")
);

bot.on("location", async (ctx) => {
  const user = getUser(ctx.from.id, ctx.from.first_name);
  const { latitude, longitude } = ctx.message.location;

  user.reportes++;
  save();

  const data = {
    lat: latitude,
    lng: longitude,
    user: ctx.from.first_name,
    rango: obtenerRango(user),
    ts: Date.now()
  };

  await ctx.telegram.sendMessage(
    RADAR_CONO_SUR,
    `🛸 AVISTAMIENTO\n👤 ${data.user}\n🎖️ ${data.rango}\n📍 ${data.lat}, ${data.lng}`
  );

  await ctx.telegram.sendMessage(
    BACKUP_CANAL,
    JSON.stringify(data)
  );

  let reportes = fs.existsSync(LOG_FILE)
    ? JSON.parse(fs.readFileSync(LOG_FILE))
    : [];

  reportes.push(data);
  fs.writeFileSync(LOG_FILE, JSON.stringify(reportes, null, 2));

  ctx.reply(`📡 Reporte procesado, ${data.rango}`);
});

/* ===============================
    PERFIL
================================ */
bot.hears("👤 Perfil", (ctx) => {
  const user = getUser(ctx.from.id);
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
  console.error("🔥 ERROR GLOBAL:", err);
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
