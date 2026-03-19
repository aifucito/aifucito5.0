import "dotenv/config";
import { Telegraf, Markup, session } from "telegraf";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/* ===============================
   CONFIG
   =============================== */

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = 7662736311;

const RADAR_CONO_SUR = "-1002447915570";
const BACKUP_CANAL = "-1003895765674";

const WEBAPP_URL = "https://aifucito5-0.onrender.com";

const GRUPOS = {
  UY: "https://t.me/+nCVD4NsOihIyNGFh",
  AR: "https://t.me/+QpErPk26SY05OGIx",
  CL: "https://t.me/+VP2T47eLvIowNmYx",
  GLOBAL: "https://t.me/+r5XfcJma3g03MWZh",
  CONOSUR: "https://t.me/+YqA6d3VpKv9mZjU5"
};

/* ===============================
   INIT
   =============================== */
bot.on("channel_post", (ctx) => {
  console.log("📢 CANAL DETECTADO");
  console.log("ID:", ctx.chat.id);
  console.log("TÍTULO:", ctx.chat.title);
});
const bot = new Telegraf(TOKEN);
bot.use(session());

const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* ===============================
   DB
   =============================== */

const DB_FILE = "usuarios.json";

let usuarios = {};
if (fs.existsSync(DB_FILE)) {
  usuarios = JSON.parse(fs.readFileSync(DB_FILE));
}

function save() {
  fs.writeFileSync(DB_FILE, JSON.stringify(usuarios, null, 2));
}

function getUser(id) {
  if (!usuarios[id]) {
    usuarios[id] = {
      reportes: 0,
      rol: "gratis",
      pais: null,
      expira: 0
    };
  }

  if (id == ADMIN_ID) {
    usuarios[id].rol = "admin";
  }

  return usuarios[id];
}

/* ===============================
   EXPIRACIÓN
   =============================== */

function calcularExpiracion() {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth() + 2, 1).getTime();
}

async function checkExpiracion(ctx, user) {
  if (user.rol === "colaborador" && Date.now() > user.expira) {
    user.rol = "gratis";
    save();
    ctx.reply("⚠️ Suscripción vencida");
  }
}

/* ===============================
   PAÍS
   =============================== */

function detectarPais(lat, lon) {
  if (lat < -30 && lat > -35 && lon < -53 && lon > -58) return "UY";
  if (lat < -22 && lat > -55 && lon < -53 && lon > -73) return "AR";
  if (lat < -17 && lat > -56 && lon < -66 && lon > -75) return "CL";
  return "GLOBAL";
}

/* ===============================
   RECONSTRUIR MAPA DESDE BACKUP
   =============================== */

async function reconstruirMapa() {
  console.log("🔄 Reconstruyendo mapa desde backup...");

  let reportes = [];

  try {
    const updates = await bot.telegram.getUpdates();

    updates.forEach(u => {
      if (u.channel_post && u.channel_post.chat.id == BACKUP_CANAL) {
        try {
          const data = JSON.parse(u.channel_post.text);
          reportes.push(data);
        } catch {}
      }
    });

    fs.writeFileSync("public/reportes.json", JSON.stringify(reportes, null, 2));

    console.log("✅ Mapa reconstruido:", reportes.length);

  } catch (e) {
    console.log("❌ Error reconstruyendo", e.message);
  }
}

/* ===============================
   MENU
   =============================== */

bot.start((ctx) => {
  if (ctx.chat.type !== "private") return;

  ctx.reply(
    "🛰️ AIFU activo...\nHablá bajo...",
    Markup.keyboard([
      ["📡 Reportar", "📊 Ver reportes"],
      ["👤 Perfil", "🗺️ Ver mapa"],
      ["💳 Colaborador"]
    ]).resize()
  );
});

/* ===============================
   REPORTES + GPS
   =============================== */

bot.hears("📡 Reportar", (ctx) => {
  ctx.reply("📍 Enviá tu ubicación");
});

bot.on("location", async (ctx) => {

  const user = getUser(ctx.from.id);
  await checkExpiracion(ctx, user);

  const { latitude, longitude } = ctx.message.location;

  if (!user.pais) {
    user.pais = detectarPais(latitude, longitude);
  }

  user.reportes++;
  save();

  const data = {
    lat: latitude,
    lng: longitude,
    user: ctx.from.first_name,
    ts: Date.now()
  };

  const texto = `🛸 AVISTAMIENTO

👤 ${data.user}
📍 ${data.lat}, ${data.lng}`;

  await ctx.telegram.sendMessage(RADAR_CONO_SUR, texto);
  await ctx.telegram.sendMessage(BACKUP_CANAL, JSON.stringify(data));

  let reportes = [];
  try {
    reportes = JSON.parse(fs.readFileSync("public/reportes.json"));
  } catch {}

  reportes.push(data);

  fs.writeFileSync("public/reportes.json", JSON.stringify(reportes, null, 2));

  ctx.reply("📡 Reporte registrado...");
});

/* ===============================
   PERFIL
   =============================== */

bot.hears("👤 Perfil", (ctx) => {

  const user = getUser(ctx.from.id);

  ctx.reply(
`🧾 Perfil

Rol: ${user.rol === "admin" ? "👑 Comandante Intergaláctico" :
       user.rol === "colaborador" ? "Colaborador AIFU" : "Gratis"}

País: ${user.pais || "No definido"}
Reportes: ${user.reportes}`
  );
});

/* ===============================
   MAPA
   =============================== */

bot.hears("🗺️ Ver mapa", (ctx) => {
  ctx.reply("🛰️ Radar activo",
    Markup.inlineKeyboard([
      Markup.button.webApp("Abrir Radar", WEBAPP_URL)
    ])
  );
});

/* ===============================
   ACTIVAR COLABORADOR
   =============================== */

bot.command("activar", (ctx) => {
  if (ctx.from.id != ADMIN_ID) return;

  const id = ctx.message.text.split(" ")[1];
  const user = getUser(id);

  user.rol = "colaborador";
  user.expira = calcularExpiracion();

  save();

  ctx.reply("✅ Activado");
});

/* ===============================
   START
   =============================== */

(async () => {
  await reconstruirMapa();
  bot.launch();
  app.listen(process.env.PORT || 3000);
})();

console.log("🛰️ AIFU operativo");
