import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import fs from "fs";

const apiId = Number(process.env.API_ID);
const apiHash = process.env.API_HASH;

const session = new StringSession(process.env.STRING_SESSION || "");

const BACKUP_CHANNEL = -1003895765674;
const ADMIN_ID = 7662736311;

const client = new TelegramClient(session, apiId, apiHash, {
  connectionRetries: 5,
});

async function iniciar() {

  await client.start({
    phoneNumber: async () => prompt("Número: "),
    password: async () => prompt("Password 2FA (si tenés): "),
    phoneCode: async () => prompt("Código Telegram: "),
  });

  console.log("🛰️ Scanner conectado");

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
   DETECTAR OLEADAS
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

        // ALERTA A VOS
        await client.sendMessage(ADMIN_ID, {
          message: `🚨 OLEADA DETECTADA\nZona: ${z}\nReportes: ${count}`
        });

        break;
      }
    }
  });
}

iniciar();
