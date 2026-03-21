import "dotenv/config";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import fs from "fs";

const client = new TelegramClient(
  new StringSession(process.env.STRING_SESSION || ""),
  Number(process.env.API_ID),
  process.env.API_HASH,
  { connectionRetries: 5 }
);

const CHANNEL = -1003757109409;

async function run() {

  await client.start({
    phoneNumber: async () => process.env.PHONE_NUMBER,
    phoneCode: async () => {
      process.stdout.write("Código: ");
      return await new Promise(r =>
        process.stdin.once("data", d => r(d.toString().trim()))
      );
    }
  });

  console.log("🛰️ Scanner activo");

  const msgs = await client.getMessages(CHANNEL, { limit: 2000 });

  const data = [];

  msgs.forEach(m => {
    try {
      data.push(JSON.parse(m.message));
    } catch {}
  });

  fs.writeFileSync("public/reportes.json", JSON.stringify(data, null, 2));
}

run();
