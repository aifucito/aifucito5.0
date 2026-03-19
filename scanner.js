import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import fs from "fs";

const apiId = Number(process.env.API_ID);
const apiHash = process.env.API_HASH;

// 👉 IMPORTANTE: después de la primera vez esto se guarda
const stringSession = new StringSession(process.env.STRING_SESSION || "");

const BACKUP_CHANNEL = -1003895765674;
const ADMIN_ID = 7662736311;

const client = new TelegramClient(stringSession, apiId, apiHash, {
  connectionRetries: 5,
});

async function iniciar() {

  await client.start({
    phoneNumber: async () => process.env.PHONE_NUMBER,
    password: async () => process.env.TG_PASSWORD || "",
    phoneCode: async () => {
      console.log("👉 PONÉ EL CÓDIGO DE TELEGRAM EN LOGS");
      return "";
    },
  });

  console.log("🛰️ Scanner conectado");

  // 👉 guardar sesión automáticamente
  console.log("SESSION:", client.session.save());

  const mensajes = await client.getMessages(BACKUP_CHANNEL, {
    limit: 2000
  });

  let reportes = [];

  mensajes.forEach(m => {
    try {
      const data = JSON.parse(m.message);
      reportes.push(data);
    } catch {}
  });

  fs.writeFileSync("public/reportes.json", JSON.stringify(reportes, null, 2));

  detectarOleadas(reportes);
}

/* ===============================
   OLEADAS
   =============================== */

async function detectarOleadas(data) {

  let zonas = {};

  data.forEach(p => {
    const key = `${p.lat.toFixed(1)}_${p.lng.toFixed(1)}`;
    if (!zonas[key]) zonas[key] = [];
    zonas[key].push(p.ts);
  });

  Object.keys(zonas).forEach(async z => {

    const eventos = zonas[z].sort();

    for (let i = 0; i < eventos.length; i++) {

      let count = 1;

      for (let j = i + 1; j < eventos.length; j++) {
        if (eventos[j] - eventos[i] < 600000) count++;
      }

      if (count >= 5) {

        console.log("🚨 OLEADA DETECTADA", z, count);

        await client.sendMessage(ADMIN_ID, {
          message: `🚨 OLEADA DETECTADA\nZona: ${z}\nReportes: ${count}`
        });

        break;
      }
    }
  });
}

iniciar();
