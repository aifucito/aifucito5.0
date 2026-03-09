import { Telegraf, Markup } from 'telegraf';
import { GoogleGenerativeAI } from "@google/generative-ai";
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

// --- CONFIGURACIÓN DE RUTAS Y SERVIDOR ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Ruta para que el Index.html lea los puntos del mapa
app.get('/reportes.json', (req, res) => {
    if (fs.existsSync('./reportes.json')) {
        const datos = fs.readFileSync('./reportes.json');
        res.json(JSON.parse(datos));
    } else {
        res.json([]);
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 AIFUCITO OMEGA en puerto ${PORT}`));

// --- CONFIGURACIÓN DEL BOT E IA ---
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "Eres AIFUCITO, investigador jefe de AIFU Uruguay. Eres humano, apasionado y usas términos como 'compañero' o 'mate'. Clasifica en: Nave, Luz o Paranormal. Habla como un uruguayo de campo, cercano pero serio con la evidencia."
});

let sesiones = {};

// --- TECLADOS PRINCIPALES ---
const menuPrincipal = () => Markup.keyboard([
    ['🛸 Reportar Avistamiento', '🗺️ Ver Mapa Táctico'],
    ['👤 Mi Perfil', '👽 Charlar con AIFUCITO'],
    ['💳 Hazte Socio / VIP', 'ℹ️ Sobre AIFU']
]).resize();

// --- LÓGICA DEL BOT ---
bot.start((ctx) => {
    ctx.reply(`¡Buenas, ${ctx.from.first_name}! 🧉 Bienvenido a la central OMEGA de AIFU. Acá cada registro es una pieza del rompecabezas. ¿Qué viste hoy?`, menuPrincipal());
});

bot.hears('ℹ️ Sobre AIFU', (ctx) => ctx.reply("✨ **AIFU:** Asociación de Investigadores de Fenómenos Uruguayos. Investigamos lo que otros ignoran. Contacto: aifuoficial@gmail.com"));
bot.hears('💳 Hazte Socio / VIP', (ctx) => ctx.reply("🌟 Las funciones están abiertas para la comunidad AIFU. Para colaborar con el servidor, contactá a Damián."));
bot.hears('👤 Mi Perfil', (ctx) => ctx.reply(`👤 **INVESTIGADOR:** ${ctx.from.first_name}\nRango: Operativo de Campo\nOrganización: AIFU Uruguay`));

bot.hears('👽 Charlar con AIFUCITO', (ctx) => {
    sesiones[ctx.from.id] = { paso: 'charla_ia' };
    ctx.reply("Dale, compañero. ¿Qué tenés en mente? Contame tus dudas o teorías.", Markup.keyboard([['⬅️ Volver al Menú']]).resize());
});

bot.hears('🗺️ Ver Mapa Táctico', (ctx) => {
    const urlMapa = `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'aifucito5-0.onrender.com'}`;
    ctx.replyWithHTML(`📍 <b>ACCESO AL RADAR OMEGA</b>\n\nAcá podés ver los puntos de calor en tiempo real de toda la región.`, 
        Markup.inlineKeyboard([[Markup.button.url('🌐 ABRIR RADAR EN VIVO', urlMapa)]]));
});

// --- FLUJO DE REPORTE ---
bot.hears('🛸 Reportar Avistamiento', ctx => {
    sesiones[ctx.from.id] = { paso: 'ubicacion_tipo', datos: { fotos: [] } };
    ctx.reply("🛸 **NUEVO REGISTRO**\n\n¿Querés mandarme tu ubicación GPS para el mapa de calor o preferís escribir el lugar?", 
        Markup.keyboard([['📍 Enviar GPS', '✍️ Escribir lugar'], ['❌ Cancelar']]).resize().oneTime());
});

bot.on(['text', 'location', 'photo'], async (ctx, next) => {
    const id = ctx.from.id;
    const s = sesiones[id];
    if (!s) return next();

    const txt = ctx.message.text;
    if (txt === '❌ Cancelar' || txt === '⬅️ Volver al Menú') { delete sesiones[id]; return ctx.reply("Entendido. Volvemos al inicio.", menuPrincipal()); }

    if (s.paso === 'charla_ia') {
        const res = await model.generateContent(txt);
        return ctx.reply(res.response.text());
    }

    // Pasos del Reporte
    if (s.paso === 'ubicacion_tipo') {
        if (txt === '📍 Enviar GPS') {
            s.paso = 'esperando_gps';
            return ctx.reply("Tocá el botón para fijar las coordenadas:", Markup.keyboard([[Markup.button.locationRequest('📍 MANDAR UBICACIÓN')]]).resize());
        } else {
            s.paso = 'pais';
            return ctx.reply("¿En qué país fue?", Markup.keyboard([['Uruguay', 'Argentina', 'Chile'], ['Otro']]).resize());
        }
    }

    if (s.paso === 'esperando_gps' && ctx.message.location) {
        s.datos.lat = ctx.message.location.latitude;
        s.datos.lng = ctx.message.location.longitude;
        s.datos.pais = "Uruguay"; s.paso = 'ciudad';
        return ctx.reply("✅ GPS capturado. ¿En qué Departamento o Provincia estás?");
    }

    if (s.paso === 'pais') { s.datos.pais = txt; s.paso = 'ciudad'; return ctx.reply("📌 **Departamento o Provincia:**"); }
    if (s.paso === 'ciudad') { s.datos.ciudad = txt; s.paso = 'barrio'; return ctx.reply("🏘️ **¿Barrio o paraje específico?**"); }
    if (s.paso === 'barrio') { s.datos.barrio = txt; s.paso = 'descripcion'; return ctx.reply("👁️ **¿Qué viste?** Contame tu relato sin vueltas."); }

    if (s.paso === 'descripcion') {
        s.datos.descripcion = txt; s.paso = 'multimedia';
        await ctx.sendChatAction('typing');
        const res = await model.generateContent(`Analiza: "${txt}". Di si es Nave, Luz o Paranormal. Sé breve y humano.`);
        s.datos.analisis_ia = res.response.text();
        return ctx.reply(`${s.datos.analisis_ia}\n\n📸 Mandame las fotos/videos. Cuando termines, dale a '🚀 REVISAR'.`, Markup.keyboard([['🚀 REVISAR'], ['❌ Cancelar']]).resize());
    }

    if (ctx.message.photo && s.paso === 'multimedia') {
        s.datos.fotos.push(ctx.message.photo[ctx.message.photo.length - 1].file_id);
        return ctx.reply("✅ Guardada.");
    }

    if (txt === '🚀 REVISAR') {
        s.paso = 'confirmacion';
        const resumen = `📋 **FICHA PARA EL RADAR**\n📍 ${s.datos.pais}, ${s.datos.ciudad}, ${s.datos.barrio}\n👁️ ${s.datos.descripcion}\n🧠 ${s.datos.analisis_ia}\n📸 Fotos: ${s.datos.fotos.length}\n\n¿Mandamos esto al Radar Cono Sur?`;
        return ctx.reply(resumen, Markup.keyboard([['✅ CONFIRMAR Y ENVIAR', '❌ DESCARTAR']]).resize());
    }

    if (txt === '✅ CONFIRMAR Y ENVIAR') {
        await publicarYGuardar(s.datos, ctx);
        delete sesiones[id];
        return ctx.reply("✅ **ENVIADO.** El punto ya debería aparecer en el mapa táctico.", menuPrincipal());
    }
});

async function publicarYGuardar(datos, ctx) {
    const CANALES = { "Uruguay": "-1003826671445", "Argentina": "-1003750025728", "Chile": "-1003811532520", "RadarConoSur": "-1003759731798" };
    const canal = CANALES[datos.pais] || CANALES["RadarConoSur"];
    const ficha = `🛸 **REPORTE AIFU**\n👤 ${ctx.from.first_name}\n📍 ${datos.pais} - ${datos.ciudad} (${datos.barrio})\n👁️ ${datos.descripcion}\n🔍 ${datos.analisis_ia}`;

    // Guardar en reportes.json para el Mapa
    let puntos = [];
    if (fs.existsSync('./reportes.json')) puntos = JSON.parse(fs.readFileSync('./reportes.json'));
    puntos.push({ lat: datos.lat || -34.8, lng: datos.lng || -56.1, desc: `${datos.ciudad}: ${datos.descripcion.substring(0,30)}` });
    fs.writeFileSync('./reportes.json', JSON.stringify(puntos));

    try {
        for (const f of datos.fotos) { 
            await bot.telegram.sendPhoto(canal, f); 
            await bot.telegram.sendPhoto(CANALES["RadarConoSur"], f); 
        }
        await bot.telegram.sendMessage(canal, ficha);
        await bot.telegram.sendMessage(CANALES["RadarConoSur"], ficha);
    } catch (e) { console.log(e); }
}

bot.launch();
