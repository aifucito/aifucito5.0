import "dotenv/config";
import { Telegraf, Markup, session } from "telegraf";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/* ===============================
    CONFIGURACIÓN TÁCTICA
   =============================== */
const TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = 7662736311; // Comandante Intergaláctico

// Canales (Asegúrate de obtener el ID real con /canalid)
const RADAR_CONO_SUR = -1002447915570;
const BACKUP_CANAL = -1003895765674;

const WEBAPP_URL = "https://aifucito5-0.onrender.com";

/* ===============================
    INICIALIZACIÓN
   =============================== */
const bot = new Telegraf(TOKEN);
bot.use(session());

const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

/* ===============================
    BASE DE DATOS (Persistencia)
   =============================== */
const DB_FILE = "usuarios.json";
const LOG_FILE = "public/reportes.json";

let usuarios = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : {};

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
    LÓGICA DE RANGOS Y PAÍS
   =============================== */
function obtenerRango(user) {
  if (user.rol === "admin") return "👑 Comandante Intergaláctico";
  if (user.rol === "colaborador") return "🛡️ Agente de Élite AIFU";
  
  const r = user.reportes;
  if (r >= 20) return "👽 Guardaespalda de Alf";
  if (r >= 10) return "🧉 Cebador de mate del Área 51";
  if (r >= 5)  return "🧹 Fajinador de retretes espaciales";
  return "🛰️ Recluta Civil";
}

function detectarPais(lat, lon) {
  if (lat < -30 && lat > -35 && lon < -53 && lon > -58) return "🇺🇾 Uruguay";
  if (lat < -22 && lat > -55 && lon < -53 && lon > -73) return "🇦🇷 Argentina";
  if (lat < -17 && lat > -56 && lon < -66 && lon > -75) return "🇨🇱 Chile";
  return "🌎 Global";
}

/* ===============================
    COMANDOS Y EVENTOS
   =============================== */

// DIAGNÓSTICO: Usar dentro de un canal para obtener su ID
bot.command("canalid", async (ctx) => {
  try {
    const chat = await ctx.getChat();
    ctx.reply(`📡 INFO DEL CHAT\n\n📌 ID: ${chat.id}\n📌 Tipo: ${chat.type}`);
  } catch (e) {
    ctx.reply("❌ Error al obtener ID");
  }
});

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

bot.hears("📡 Reportar", (ctx) => ctx.reply("📍 Enviá tu ubicación por GPS..."));

bot.on("location", async (ctx) => {
  const user = getUser(ctx.from.id, ctx.from.first_name);
  const { latitude, longitude } = ctx.message.location;

  // Actualizar datos del usuario
  user.reportes++;
  if (!user.pais || user.pais === "🌎 Global") {
      user.pais = detectarPais(latitude, longitude);
  }
  save();

  const data = {
    lat: latitude,
    lng: longitude,
    user: ctx.from.first_name,
    rango: obtenerRango(user),
    ts: Date.now()
  };

  // 1. Enviar al Radar Principal (Texto)
  const texto = `🛸 **AVISTAMIENTO DETECTADO**\n\n👤 **Origen:** ${data.user}\n🎖️ **Rango:** ${data.rango}\n📍 **Coords:** ${data.lat}, ${data.lng}\n🇺🇮 **Zona:** ${user.pais}`;
  await ctx.telegram.sendMessage(RADAR_CONO_SUR, texto, { parse_mode: "Markdown" });

  // 2. Enviar al Canal Backup (JSON para reconstrucción)
  await ctx.telegram.sendMessage(BACKUP_CANAL, JSON.stringify(data));

  // 3. Guardar en el JSON del Mapa (WebApp)
  let reportes = fs.existsSync(LOG_FILE) ? JSON.parse(fs.readFileSync(LOG_FILE)) : [];
  reportes.push(data);
  fs.writeFileSync(LOG_FILE, JSON.stringify(reportes, null, 2));

  ctx.reply(`📡 Reporte procesado, ${data.rango}. El radar se ha actualizado.`);
});

bot.hears("👤 Perfil", (ctx) => {
  const user = getUser(ctx.from.id);
  ctx.reply(
`🧾 **EXPEDIENTE AIFU**

🎖️ **Rango:** ${obtenerRango(user)}
🇺🇮 **Zona:** ${user.pais || "No detectada"}
📊 **Avistamientos:** ${user.reportes}
💳 **Estado:** ${user.rol.toUpperCase()}`, { parse_mode: "Markdown" });
});

bot.hears("🗺️ Ver mapa", (ctx) => {
  ctx.reply("🔭 Abriendo Radar Táctico...",
    Markup.inlineKeyboard([
      Markup.button.webApp("🛰️ Iniciar Escaneo", WEBAPP_URL)
    ])
  );
});

/* ===============================
    SERVIDOR Y ARRANQUE
   =============================== */
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

(async () => {
  console.log("🚀 AIFU OS Operativo");
  bot.launch();
  app.listen(process.env.PORT || 3000);
})();
