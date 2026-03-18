// bot.js
import "dotenv/config";
import { Telegraf, Markup } from "telegraf";
import express from "express";
import fs from "fs-extra";

// =========================
// VALIDAR TOKEN
// =========================
if (!process.env.BOT_TOKEN) {
  console.error("ERROR: La variable de entorno BOT_TOKEN no está definida.");
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

const DATA_FILE = "./data.json";
const COLAB_FILE = "./colaboradores.json";

// =========================
// CONFIGURACIÓN ADMIN Y GRUPO
// =========================
const ADMIN_ID = process.env.ADMIN_ID || "TU_ID"; // Opcional: definir en variables de entorno
const GRUPO_ID = process.env.GRUPO_ID || "-1003895765674"; // Opcional: definir en variables de entorno

// =========================
// INICIALIZAR ARCHIVOS
// =========================
await fs.ensureFile(DATA_FILE);
await fs.ensureFile(COLAB_FILE);

if (!(await fs.pathExists(DATA_FILE))) await fs.writeJson(DATA_FILE, []);
if (!(await fs.pathExists(COLAB_FILE))) await fs.writeJson(COLAB_FILE, {});

// =========================
// PERSONALIDAD
// =========================
const personalidad = {
  inicio: [
    "👁️ Entraste… hablá bajo… CRIDOVNI no siempre avisa…",
    "🛸 Bienvenido… ¿seguro que nadie te siguió?",
    "😶‍🌫️ AIFU activo… cuidado con los hombres de negro…"
  ],
  pedir: [
    "📍 Mandá la ubicación… pero mirá alrededor…",
    "🛰️ Necesito coordenadas… rápido…",
    "👀 Pasame ubicación… por las dudas"
  ],
  ok: [
    "🛸 Registro guardado… shhh 🤫",
    "📡 Señal recibida… no digas nada",
    "👁️ Ya está… AIFU lo tiene"
  ],
  no_colab: [
    "👀 Ves poco… los colaboradores ven todo…",
    "🤫 Hay más… pero no está liberado",
    "🛑 Acceso limitado… por ahora"
  ],
  colab: [
    "🟢 Estás dentro…",
    "👁️ Acceso completo…",
    "😶‍🌫️ Sos parte ahora"
  ]
};

function r(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// =========================
// COLABORADORES
// =========================
async function getColabs() {
  return await fs.readJson(COLAB_FILE);
}

async function saveColabs(data) {
  await fs.writeJson(COLAB_FILE, data, { spaces: 2 });
}

async function esColaborador(id) {
  const c = await getColabs();
  return !!c[id];
}

// =========================
// ZONA CALIENTE
// =========================
function distanciaKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI/180;
  const dLon = (b.lon - a.lon) * Math.PI/180;

  const lat1 = a.lat * Math.PI/180;
  const lat2 = b.lat * Math.PI/180;

  const x = Math.sin(dLat/2) ** 2 +
            Math.sin(dLon/2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

function detectarZonaCaliente(data, nuevo) {
  const ahora = Date.now();

  const cercanos = data.filter(p => {
    const tiempo = (ahora - p.ts) < (60 * 60 * 1000); // 1h
    const dist = distanciaKm(p, nuevo) < 10; // 10km
    return tiempo && dist;
  });

  return cercanos.length >= 3;
}

// =========================
// BOT
// =========================
bot.start((ctx) => {
  ctx.reply(
    r(personalidad.inicio),
    Markup.keyboard([
      ["📡 Reportar avistamiento"],
      ["🤝 Ser colaborador"],
      ["📊 Estado"]
    ]).resize()
  );
});

bot.hears("🤝 Ser colaborador", (ctx) => {
  ctx.reply(
`🤝 COLABORADOR AIFU

🛰️ Acceso completo al radar
📡 Más reportes visibles
👁️ Participación real

Si querés entrar...
escribime.

(shhh… no es para todos)`
  );
});

bot.hears("📊 Estado", async (ctx) => {
  const c = await esColaborador(ctx.from.id);
  ctx.reply(c ? r(personalidad.colab) : r(personalidad.no_colab));
});

bot.hears("📡 Reportar avistamiento", (ctx) => {
  ctx.reply(
    r(personalidad.pedir),
    Markup.keyboard([
      Markup.button.locationRequest("📍 Enviar ubicación")
    ]).resize()
  );
});

bot.on("location", async (ctx) => {
  const { latitude, longitude } = ctx.message.location;
  const data = await fs.readJson(DATA_FILE);

  const nuevo = {
    lat: latitude,
    lon: longitude,
    agente: ctx.from.first_name,
    ts: Date.now()
  };

  data.push(nuevo);
  await fs.writeJson(DATA_FILE, data, { spaces: 2 });

  // PUBLICAR EN GRUPO
  bot.telegram.sendMessage(GRUPO_ID,
`🛸 NUEVO REPORTE

👤 ${ctx.from.first_name}
📍 https://maps.google.com/?q=${latitude},${longitude}`
  );

  // DETECTAR ZONA CALIENTE
  if (detectarZonaCaliente(data, nuevo)) {
    bot.telegram.sendMessage(GRUPO_ID,
`🚨 ALERTA AIFU

Múltiples reportes en la misma zona

👁️ Actividad inusual detectada`
    );
  }

  ctx.reply(r(personalidad.ok));
});

bot.command("colab", async (ctx) => {
  if (String(ctx.from.id) !== ADMIN_ID) return;
  const args = ctx.message.text.split(" ");
  const userId = args[1];
  if (!userId) return ctx.reply("uso: /colab id");

  const c = await getColabs();
  c[userId] = true;
  await saveColabs(c);

  ctx.reply("🟢 colaborador activado");
});

// =========================
// API MAPA
// =========================
app.get("/radar-data", async (req, res) => {
  const userId = req.query.user;
  const data = await fs.readJson(DATA_FILE);
  if (await esColaborador(userId)) return res.json(data);
  return res.json(data.slice(-6));
});

// =========================
// SERVER
// =========================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => console.log("Servidor activo en", PORT));

// =========================
// LANZAR BOT
// =========================
bot.launch()
  .then(() => console.log("Bot iniciado correctamente 🚀"))
  .catch(err => console.error("Error al iniciar el bot:", err));
