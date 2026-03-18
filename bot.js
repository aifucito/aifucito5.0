import "dotenv/config";
import { Telegraf, Markup, session } from "telegraf";
import express from "express";
import fs from "fs";

/* ===============================
   CONFIGURACIÓN CENTRAL
   =============================== */

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = "7662736311";

const RADAR_CONO_SUR = "-1002447915570";
const CANAL_UY = "-1002341505345";
const CANAL_AR = "-1002319047243";
const CANAL_CL = "-1002334825945";
const CANAL_GLOBAL = "-4740280144";

const BACKUP_CANAL = "-1003895765674";

const WEBAPP_URL = "https://aifucito5-0.onrender.com";

/* ===============================
   INICIALIZACIÓN
   =============================== */

const bot = new Telegraf(TOKEN);
bot.use(session());

const app = express();
app.use(express.json());

/* ===============================
   BASE DE DATOS SIMPLE
   =============================== */

const DB_FILE = "usuarios.json";

let usuarios = {};
if (fs.existsSync(DB_FILE)) {
  usuarios = JSON.parse(fs.readFileSync(DB_FILE));
}

function guardarUsuarios() {
  fs.writeFileSync(DB_FILE, JSON.stringify(usuarios, null, 2));
}

/* ===============================
   UTILIDADES
   =============================== */

function getUser(id) {
  if (!usuarios[id]) {
    usuarios[id] = {
      reportes: 0,
      ultimoReporte: 0,
      rol: "gratis"
    };
  }
  return usuarios[id];
}

function rango(reportes) {
  if (reportes <= 5) return "Fajinador de retretes espaciales";
  if (reportes <= 15) return "Cebador del mate del Área 51";
  if (reportes <= 30) return "Guardaespaldas de Alf";
  if (reportes <= 50) return "Paseador de Chupacabras";
  if (reportes <= 80) return "Traductor de círculos";
  if (reportes <= 120) return "Catador de sondas";
  if (reportes <= 200) return "Piloto de plato con GNC";
  return "Comandante Intergaláctico";
}

/* ===============================
   MENÚ PRINCIPAL
   =============================== */

bot.start((ctx) => {
  ctx.reply(
    "🛰️ AIFU activo...\nHablá bajo... esto no es público.",
    Markup.keyboard([
      ["📡 Reportar avistamiento", "👤 Perfil"],
      ["🗺️ Ver mapa", "🛰️ Hacerse colaborador"]
    ]).resize()
  );
});

/* ===============================
   PERFIL
   =============================== */

bot.hears("👤 Perfil", (ctx) => {
  const user = getUser(ctx.from.id);

  ctx.reply(
    `👁️ Perfil confidencial

🆔 ID: ${ctx.from.id}
📊 Reportes: ${user.reportes}
🎖️ Rango: ${rango(user.reportes)}
🔓 Estado: ${user.rol === "colaborador" ? "Colaborador AIFU" : "Gratis"}`
  );
});

/* ===============================
   MAPA
   =============================== */

bot.hears("🗺️ Ver mapa", (ctx) => {
  ctx.reply(
    "🛰️ Accediendo al radar...",
    Markup.inlineKeyboard([
      Markup.button.webApp("🌐 Abrir Radar", WEBAPP_URL)
    ])
  );
});

/* ===============================
   COLABORADOR
   =============================== */

bot.hears("🛰️ Hacerse colaborador", (ctx) => {
  ctx.reply(
`👁️‍🗨️ Shhh... CRIDOVNI podría estar escuchando...

Acceso completo por 3 USD:

🟣 Prex: 20184008
🟡 Mi Dinero: 3701464270
🌐 PayPal: electros@adinet.com.uy

📸 Enviá el comprobante aquí.

Un agente validará tu acceso manualmente...`
  );
});

/* ===============================
   COMPROBANTES
   =============================== */

bot.on("photo", async (ctx) => {
  const user = ctx.from;

  await ctx.telegram.sendMessage(
    ADMIN_ID,
    `🆕 Nuevo posible colaborador

👤 ${user.first_name}
🆔 ${user.id}
@${user.username || "sin username"}`
  );

  await ctx.telegram.forwardMessage(
    ADMIN_ID,
    ctx.chat.id,
    ctx.message.message_id
  );

  ctx.reply("📡 Comprobante enviado. Estamos verificando...");
});

/* ===============================
   ACTIVAR USUARIO
   =============================== */

bot.command("activar", (ctx) => {
  if (ctx.from.id != ADMIN_ID) return;

  const id = ctx.message.text.split(" ")[1];

  const user = getUser(id);
  user.rol = "colaborador";

  guardarUsuarios();

  ctx.reply(`✅ Usuario ${id} ahora es Colaborador AIFU`);
});

/* ===============================
   REPORTES
   =============================== */

bot.hears("📡 Reportar avistamiento", (ctx) => {
  ctx.reply("📍 Enviá ubicación o descripción del avistamiento");
});

bot.on("text", async (ctx) => {
  if (ctx.message.text.startsWith("/")) return;

  const user = getUser(ctx.from.id);
  const ahora = Date.now();

  if (user.rol === "gratis") {
    const unDia = 86400000;

    if (ahora - user.ultimoReporte < unDia) {
      return ctx.reply("⚠️ Solo podés hacer 1 reporte por día");
    }
  }

  user.reportes++;
  user.ultimoReporte = ahora;
  guardarUsuarios();

  const mensaje = `🛸 NUEVO AVISTAMIENTO

👤 ${ctx.from.first_name}
🌎 ${ctx.message.text}`;

  await ctx.telegram.sendMessage(RADAR_CONO_SUR, mensaje);
  await ctx.telegram.sendMessage(BACKUP_CANAL, mensaje);

  ctx.reply("📡 Reporte enviado...");
});

/* ===============================
   SERVIDOR WEB
   =============================== */

app.get("/", (req, res) => {
  res.send("AIFU BOT ONLINE");
});

/* ===============================
   INICIO
   =============================== */

bot.launch();
app.listen(process.env.PORT || 3000);

console.log("🛰️ Bot AIFU activo...");
