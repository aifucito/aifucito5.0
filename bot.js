console.log("TOKEN:", process.env.BOT_TOKEN);
import "dotenv/config";
import { Telegraf } from "telegraf";
import express from "express";

/* ===============================
   CONFIG
=============================== */

const TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;

if (!TOKEN) {
  throw new Error("Falta BOT_TOKEN en variables de entorno");
}

/* ===============================
   BOT
=============================== */

const bot = new Telegraf(TOKEN);

/* ===============================
   DETECTOR DE ID (LO IMPORTANTE)
=============================== */

bot.on("message", (ctx) => {
  console.log("====== NUEVO MENSAJE ======");
  console.log("CHAT ID:", ctx.chat.id);
  console.log("CHAT TYPE:", ctx.chat.type);
  console.log("CHAT TITLE:", ctx.chat.title);
  console.log("USUARIO:", ctx.from?.username);
  console.log("MENSAJE:", ctx.message.text);
  console.log("===========================");
});

/* ===============================
   EXPRESS (Render necesita esto)
=============================== */

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Bot activo 🚀");
});

/* ===============================
   WEBHOOK
=============================== */

const WEBHOOK_URL = process.env.WEBHOOK_URL;

if (!WEBHOOK_URL) {
  throw new Error("Falta WEBHOOK_URL");
}

app.use(bot.webhookCallback("/bot"));

bot.telegram.setWebhook(`${WEBHOOK_URL}/bot`);

app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto", PORT);
});
