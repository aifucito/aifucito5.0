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

const RADAR_CONO_SUR = -1002447915570;
const BACKUP_CANAL = -1003895765674; // luego lo reemplazas

const WEBAPP_URL = "https://aifucito5-0.onrender.com";

/* ===============================
   INIT
   =============================== */

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
   DB SIMPLE
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
    usuarios[id] = { reportes: 0, rol: "gratis", pais: null };
  }

  if (id == ADMIN_ID) usuarios[id].rol = "admin";
  return usuarios[id];
}

/* ===============================
   🔥 OBTENER ID DEL CANAL
   =============================== */

// ✔️ USAR ESTE COMANDO EN EL CANAL
bot.command("canalid", async (ctx) => {
  try {
    const chat = await ctx.getChat();

    ctx.reply(
`📡 INFO DEL CHAT

📌 ID: ${chat.id}
📌 Título: ${chat.title || "Sin nombre"}
📌 Tipo: ${chat.type}`
    );

    console.log("CANAL ID:", chat.id);

  } catch (e) {
    ctx.reply("❌ No se pudo obtener el ID");
  }
});

/* ===============================
   START
   =============================== */

bot.start((ctx) => {
  if (ctx.chat.type !== "private") return;

  ctx.reply(
    "🛰️ AIFU activo",
    Markup.keyboard([
      ["📡 Reportar", "👤 Perfil"]
    ]).resize()
  );
});

/* ===============================
   REPORTES (ejemplo base)
   =============================== */

bot.on("location", async (ctx) => {
  const user = getUser(ctx.from.id);

  const { latitude, longitude } = ctx.message.location;

  const data = {
    lat: latitude,
    lng: longitude,
    user: ctx.from.first_name,
    ts: Date.now()
  };

  // radar principal
  await ctx.telegram.sendMessage(
    RADAR_CONO_SUR,
    `🛸 AVISTAMIENTO\n👤 ${data.user}\n📍 ${data.lat}, ${data.lng}`
  );

  // backup (cuando ya tengas ID correcto)
  await ctx.telegram.sendMessage(
    BACKUP_CANAL,
    JSON.stringify(data)
  );

  ctx.reply("📡 Reporte enviado");
});

/* ===============================
   PERFIL
   =============================== */

bot.hears("👤 Perfil", (ctx) => {
  const user = getUser(ctx.from.id);

  ctx.reply(
`🧾 Perfil
Rol: ${user.rol}
Reportes: ${user.reportes}`
  );
});

/* ===============================
   START SERVER
   =============================== */

(async () => {
  console.log("🛰️ Bot activo");
  bot.launch();
  app.listen(process.env.PORT || 3000);
})();
