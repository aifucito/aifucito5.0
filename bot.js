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
    BASE LOCAL (SE MANTIENE)
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
    RANGOS Y PAÍS
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
    TEST SUPABASE
================================ */
bot.command("testdb", async (ctx) => {
  const { error } = await supabase
    .from("usuarios")
    .insert({
      id: ctx.from.id.toString(),
      nombre: ctx.from.first_name,
      rol: "test",
      reportes: 0
    });

  if (error) {
    console.error(error);
    return ctx.reply("❌ Error con Supabase");
  }

  ctx.reply("✅ Supabase funcionando");
});

/* ===============================
    BOT
================================ */
bot.start((ctx) => {
  if (ctx.chat.type !== "private") return;
  ctx.reply(
    "🛰️ HOLA! SOY AIFUCITO... Hablá bajo...",
    Markup.keyboard([
      [Markup.button.locationRequest("📍 Enviar ubicación")],
      ["📡 Reportar", "📊 Ver reportes"],
      ["👤 Perfil", "🗺️ Ver mapa"]
    ]).resize()
  );
});

bot.hears("📡 Reportar", (ctx) =>
  ctx.reply("📍 Tocá el botón de arriba para enviar tu ubicación automáticamente")
);

/* ===============================
    UBICACIÓN (SUPABASE + BACKUP)
================================ */
bot.on("location", async (ctx) => {
  const localUser = getUser(ctx.from.id, ctx.from.first_name);
  const dbUser = await getUserDB(ctx.from.id, ctx.from.first_name);

  const { latitude, longitude } = ctx.message.location;

  // LOCAL
  localUser.reportes++;
  if (!localUser.pais) {
    localUser.pais = detectarPais(latitude, longitude);
  }
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
    ts: Date.now()
  };

  // GUARDAR EN SUPABASE
  await supabase.from("reportes").insert({
    user_id: ctx.from.id.toString(),
    lat: latitude,
    lng: longitude,
    rango: data.rango
  });

  // RADAR
  const texto = `🛸 AVISTAMIENTO\n👤 ${data.user}\n🎖️ ${data.rango}\n📍 ${data.lat}, ${data.lng}\n🌎 ${localUser.pais}`;
  await ctx.telegram.sendMessage(RADAR_CONO_SUR, texto);

  // BACKUP CANAL
  await ctx.telegram.sendMessage(BACKUP_CANAL, JSON.stringify(data));

  // BACKUP LOCAL
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
