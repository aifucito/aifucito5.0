import "dotenv/config";
import { Telegraf, Markup } from "telegraf";
import express from "express";
import fs from "fs";
import crypto from "crypto";

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();
const PORT = process.env.PORT || 3000;

let reportes = [];

// ==========================
// CARGA SEGURA
// ==========================
try {
  reportes = JSON.parse(fs.readFileSync("data.json"));
} catch {
  reportes = [];
}

// ==========================
// RANGOS
// ==========================
function obtenerRango(cantidad) {
  if (cantidad >= 80) return "🧠 Fundador de rutas espaciales";
  if (cantidad >= 40) return "🔭 Vigilante del cielo";
  if (cantidad >= 20) return "🛰️ Investigador de campo";
  if (cantidad >= 10) return "👽 Guardaespaldas de ALF";
  if (cantidad >= 5) return "🛸 Avistador de lo oculto";
  return "🧉 Cebador de mate galáctico";
}

// ==========================
// GUARDAR
// ==========================
function guardar() {
  fs.writeFileSync("data.json", JSON.stringify(reportes));
}

// ==========================
// BIENVENIDA
// ==========================
bot.start(ctx => {
  ctx.reply(
`Shhh… hablá bajo… 👁️

Esto no es un bot normal.
Acá registramos lo que otros prefieren ignorar…

CRIDOVNI no siempre llega primero…
y los hombres de negro… bueno… mejor no hablar de eso.

¿Viste algo en el cielo?`,
    Markup.keyboard([["📡 Reportar avistamiento"]]).resize()
  );
});

// ==========================
// PEDIR GPS
// ==========================
bot.hears("📡 Reportar avistamiento", ctx => {
  ctx.reply(
`Activá tu GPS…

Nada de escribir lugares.
Necesitamos coordenadas exactas.

(Y mirá atrás… por si acaso…)`,
    Markup.keyboard([
      Markup.button.locationRequest("📍 Enviar ubicación")
    ]).resize()
  );
});

// ==========================
// RECIBIR UBICACIÓN
// ==========================
bot.on("location", ctx => {

  const { latitude, longitude } = ctx.message.location;

  const userReports = reportes.filter(r => r.user === ctx.from.id);

  const reporte = {
    id: crypto.randomUUID(),
    lat: latitude,
    lon: longitude,
    ts: Date.now(),
    user: ctx.from.id
  };

  reportes.push(reporte);
  guardar();

  const rango = obtenerRango(userReports.length + 1);

  // enviar al canal
  bot.telegram.sendMessage(
    process.env.CANAL_ID,
    JSON.stringify(reporte)
  );

  ctx.reply(
`📡 Señal registrada…

Rango actual:
${rango}

Seguimos observando…`
  );
});

// ==========================
// API MAPA
// ==========================
app.get("/radar-data", (req, res) => {
  res.json(reportes);
});

// ==========================
// DETECCIÓN DE OLAS
// ==========================
function detectarOla() {

  const ahora = Date.now();

  const recientes = reportes.filter(r => ahora - r.ts < 3600000);

  if (recientes.length >= 10) {
    bot.telegram.sendMessage(
      process.env.CANAL_ID,
      "🚨 ACTIVIDAD ANÓMALA DETECTADA EN EL CONO SUR"
    );
  }
}

setInterval(detectarOla, 60000);

// ==========================
bot.launch();
app.listen(PORT);
