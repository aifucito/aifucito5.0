import { Telegraf, Markup } from 'telegraf';
import { GoogleGenerativeAI } from "@google/generative-ai";
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

const DB_FILE = './base_datos_aifu.json';
const MAP_FILE = './reportes.json';

let db = { usuarios: {} };
if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE));
const guardarDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

const obtenerRango = (puntos) => {
    if (puntos < 30) return { nombre: "Limpiador de Turbinas", sig: 30 - puntos };
    if (puntos < 100) return { nombre: "Cebador de Mate Intergaláctico", sig: 100 - puntos };
    if (puntos < 250) return { nombre: "Cadete Recluta de AIFU", sig: 250 - puntos };
    if (puntos < 500) return { nombre: "Rastreador de Duendes", sig: 500 - puntos };
    if (puntos < 1000) return { nombre: "Perito de Luces Extrañas", sig: 1000 - puntos };
    return { nombre: "Comandante del Radar OMEGA", sig: 0 };
};

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/reportes.json', (req, res) => {
    if (fs.existsSync(MAP_FILE)) res.json(JSON.parse(fs.readFileSync(MAP_FILE)));
    else res.json([]);
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 AIFUCITO OMEGA v5.5 ACTIVO`));

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "Eres AIFUCITO. Un investigador uruguayo de campo. Hablas de forma simple, cercana y usas términos como 'mate' o 'compañero'. Tu objetivo es charlar con el usuario sobre teorías, OVNIs o el clima. No seas robótico."
});

let sesiones = {};
let chatsIA = {}; // Aquí guardamos la "memoria" para que responda de verdad

const menuPrincipal = () => Markup.keyboard([
    ['🛸 Reportar Avistamiento', '🗺️ Ver Mapa Táctico'],
    ['👤 Mi Perfil de Investigador', '👽 Charlar con AIFUCITO'],
    ['💳 Hazte Socio / VIP', 'ℹ️ Sobre AIFU']
]).resize();

bot.start((ctx) => {
    const id = ctx.from.id;
    if (!db.usuarios[id]) db.usuarios[id] = { nombre: ctx.from.first_name, puntos: 0, reportes: 0 };
    guardarDB();
    ctx.reply(`¡Buenas, ${ctx.from.first_name}! 🧉 Bienvenido. ¿Qué viste hoy?`, menuPrincipal());
});

bot.hears('ℹ️ Sobre AIFU', (ctx) => ctx.reply("✨ Asociación de Investigadores de Fenómenos Uruguayos. Contacto: aifuoficial@gmail.com"));
bot.hears('💳 Hazte Socio / VIP', (ctx) => ctx.reply("🌟 Contactá a Damián para colaborar con el servidor."));

bot.hears('👤 Mi Perfil de Investigador', (ctx) => {
    const user = db.usuarios[ctx.from.id] || { puntos: 0, reportes: 0 };
    const rango = obtenerRango(user.puntos);
    ctx.reply(`👤 **INVESTIGADOR:** ${ctx.from.first_name}\n🎖️ **Rango:** ${rango.nombre}\n📊 **Puntos:** ${user.puntos}\n🛸 **Reportes:** ${user.reportes}`);
});

bot.hears('👽 Charlar con AIFUCITO', (ctx) => {
    const id = ctx.from.id;
    sesiones[id] = { paso: 'charla_ia' };
    chatsIA[id] = model.startChat({ history: [] }); // Iniciamos el motor de charla
    ctx.reply("¡Hola, compañero! Contame, ¿en qué te puedo ayudar hoy? (Para salir toca '⬅️ Volver')", Markup.keyboard([['⬅️ Volver al Menú']]).resize());
});

bot.hears('🗺️ Ver Mapa Táctico', (ctx) => {
    const urlMapa = `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'aifucito5-0.onrender.com'}`;
    ctx.replyWithHTML(`📍 <b>RADAR OMEGA</b>`, Markup.inlineKeyboard([[Markup.button.url('🌐 ABRIR RADAR', urlMapa)]]));
});

bot.hears('🛸 Reportar Avistamiento', ctx => {
    sesiones[ctx.from.id] = { paso: 'ubicacion_tipo', datos: { fotos: [] } };
    ctx.reply("🛸 **NUEVO REGISTRO**\n¿GPS o escribir lugar?", Markup.keyboard([['📍 Enviar GPS', '✍️ Escribir lugar'], ['❌ Cancelar']]).resize());
});

bot.on(['text', 'location', 'photo'], async (ctx, next) => {
    const id = ctx.from.id;
    const s = sesiones[id];
    if (!s) return next();

    const txt = ctx.message.text;
    if (txt === '❌ Cancelar' || txt === '⬅️ Volver al Menú') { 
        delete sesiones[id]; 
        delete chatsIA[id];
        return ctx.reply("Volvemos al inicio.", menuPrincipal()); 
    }

    // --- ARREGLO DE LA CHARLA ---
    if (s.paso === 'charla_ia') {
        try {
            await ctx.sendChatAction('typing');
            const chat = chatsIA[id] || model.startChat({ history: [] });
            const result = await chat.sendMessage(txt); // Aquí es donde charla de verdad
            return ctx.reply(result.response.text());
        } catch (e) {
            console.error(e);
            return ctx.reply("Se me enfrió el mate, compañero. ¿Me decís de nuevo?");
        }
    }

    // --- LÓGICA DE REPORTE ---
    if (s.paso === 'ubicacion_tipo') {
        if (txt === '📍 Enviar GPS') {
            s.paso = 'esperando_gps';
            return ctx.reply("Mandá el GPS:", Markup.keyboard([[Markup.button.locationRequest('📍 MANDAR UBICACIÓN')]]).resize());
        } else {
            s.paso = 'pais';
            return ctx.reply("¿País?", Markup.keyboard([['Uruguay', 'Argentina', 'Chile'], ['Otro (Global)']]).resize());
        }
    }

    if (s.paso === 'esperando_gps' && ctx.message.location) {
        s.datos.lat = ctx.message.location.latitude; s.datos.lng = ctx.message.location.longitude;
        s.datos.pais = "Uruguay"; s.paso = 'ciudad';
        return ctx.reply("✅ GPS capturado. ¿Departamento o Provincia?");
    }

    if (s.paso === 'pais') { s.datos.pais = txt; s.paso = 'ciudad'; return ctx.reply("📌 **Departamento/Provincia:**"); }
    if (s.paso === 'ciudad') { s.datos.ciudad = txt; s.paso = 'barrio'; return ctx.reply("🏘️ **¿Barrio?**"); }
    if (s.paso === 'barrio') { s.datos.barrio = txt; s.paso = 'descripcion'; return ctx.reply("👁️ **¿Qué viste?**"); }

    if (s.paso === 'descripcion') {
        s.datos.descripcion = txt; s.paso = 'multimedia';
        await ctx.sendChatAction('typing');
        const res = await model.generateContent(`Analiza: "${txt}". Di si es Nave, Luz o Paranormal. Sé breve.`);
        s.datos.analisis_ia = res.response.text();
        return ctx.reply(`${s.datos.analisis_ia}\n\n📸 Fotos y luego '🚀 REVISAR'.`, Markup.keyboard([['🚀 REVISAR'], ['❌ Cancelar']]).resize());
    }

    if (ctx.message.photo && s.paso === 'multimedia') {
        s.datos.fotos.push(ctx.message.photo[ctx.message.photo.length - 1].file_id);
        return ctx.reply("✅ Foto guardada.");
    }

    if (txt === '🚀 REVISAR') {
        s.paso = 'confirmacion';
        return ctx.reply(`📋 **FICHA**\n📍 ${s.datos.pais}, ${s.datos.ciudad}\n👁️ ${s.datos.descripcion}\n¿Enviamos?`, Markup.keyboard([['✅ CONFIRMAR Y ENVIAR', '❌ DESCARTAR']]).resize());
    }

    if (txt === '✅ CONFIRMAR Y ENVIAR') {
        db.usuarios[id].puntos += 10;
        db.usuarios[id].reportes += 1;
        guardarDB();
        await publicarYGuardar(s.datos, ctx);
        delete sesiones[id];
        ctx.reply(`✅ Enviado. Sumaste 10 puntos.`, menuPrincipal());
    }
});

async function publicarYGuardar(datos, ctx) {
    const CANALES = { "Uruguay": "-1003826671445", "Argentina": "-1003750025728", "Chile": "-1003811532520", "Otro (Global)": "-1003820597313", "RadarConoSur": "-1003759731798" };
    const canal = CANALES[datos.pais] || CANALES["Otro (Global)"];
    const ficha = `🛸 **REPORTE AIFU**\n👤 ${ctx.from.first_name}\n📍 ${datos.pais} - ${datos.ciudad}\n👁️ ${datos.descripcion}\n🔍 ${datos.analisis_ia}`;

    let puntosMap = [];
    if (fs.existsSync(MAP_FILE)) puntosMap = JSON.parse(fs.readFileSync(MAP_FILE));
    puntosMap.push({ lat: datos.lat || -34.8, lng: datos.lng || -56.1, desc: `${datos.ciudad}: ${datos.descripcion.substring(0,30)}` });
    fs.writeFileSync(MAP_FILE, JSON.stringify(puntosMap));

    try {
        for (const f of datos.fotos) { 
            await bot.telegram.sendPhoto(canal, f).catch(e => console.log(e)); 
            await bot.telegram.sendPhoto(CANALES["RadarConoSur"], f).catch(e => console.log(e)); 
        }
        await bot.telegram.sendMessage(canal, ficha);
        await bot.telegram.sendMessage(CANALES["RadarConoSur"], ficha);
    } catch (e) { console.log(e); }
}

bot.launch();
