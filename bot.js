import { Telegraf } from 'telegraf';
import express from 'express';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('ESCÁNER AIFU ACTIVO'));
app.listen(PORT, () => console.log(`Escáner listo`));

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

// ESTO ATRAPA EL ID DE CUALQUIER COSA QUE ESCRIBAS
bot.on('message', async (ctx) => {
    const chatId = ctx.chat.id;
    console.log(`🚀 ID DETECTADO: ${chatId}`);
    try {
        await ctx.reply(`✅ ID de este chat: ${chatId}`);
    } catch (e) {
        console.log("Detectado, pero no puedo responder en el grupo. ID:", chatId);
    }
});

bot.launch();
