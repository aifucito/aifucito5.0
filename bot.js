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

// --- NUEVA ESCALA DE RANGOS DIVERTIDA ---
const obtenerRango = (puntos) => {
    if (puntos < 30) return { nombre: "🧻 Fajinador de Retretes Espaciales", sig: 30 - puntos };
    if (puntos < 100) return { nombre: "🧉 Cebador de Mate Intergaláctico", sig: 100 - puntos };
    if (puntos < 250) return { nombre: "👽 Traductor de Dialectos Marcianos", sig: 250 - puntos };
    if (puntos < 500) return { nombre: "🔭 Cazador de Luces de Boliche", sig: 500 - puntos };
    if (puntos < 1000) return { nombre: "🛸 Piloto de Plato Volador a Pedal", sig: 1000 - puntos };
    return { nombre: "👨‍🚀 COMANDANTE AEROESPACIAL AIFULOGO", sig: 0 };
};

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/reportes.json', (req, res) => {
    if (fs.existsSync(MAP_FILE)) res.json(JSON.parse(fs.readFileSync(MAP_FILE)));
    else res.json([]);
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 AIFUCITO 5.0 ACTIVO`));

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "Eres AIFUCITO, el asistente alegre de AIFU Uruguay. Eres divertido, entusiasta y te apasionan los OVNIs. Habla como un uruguayo moderno, servicial y con mucha energía. Evita palabras políticas como 'compañero'."
});

let sesiones = {};
let chatsIA = {}; 

const menuPrincipal = () => Markup.keyboard([
    ['🛸 Reportar Avistamiento', '🗺️ Ver Mapa Táctico'],
    ['🎖️ Mi Rango de Investigador', '👽 Charlar con AIFUCITO'],
    ['💳 Hazte Socio / VIP', 'ℹ️ Sobre AIFU']
]).resize();

bot.start((ctx) => {
    const id = ctx.from.id;
    if (!db.usuarios[id]) db.usuarios[id] = { nombre: ctx.from.first_name, puntos: 0, reportes: 0 };
    guardarDB();
    const r = obtenerRango(db.usuarios[id].puntos);
    ctx.reply(`¡Hola! 👋 Soy AIFUCITO, tu asistente de investigación. ¡Qué bueno verte!\n\nTu rango actual: ${r.nombre}.`, menuPrincipal());
});

// --- SECCIÓN VIP E HISTORIAS ---
bot.hears('💳 Hazte Socio / VIP', (ctx) => {
    ctx.reply(
        "🌟 **ZONA VIP Y RELATOS**\n\n¿Qué desea hacer, investigador? Aquí puede mantener su anonimato al 100%:",
        Markup.keyboard([
            ['🕵️ Reporte Anónimo (VIP)', '📖 Contar mi Historia'], 
            ['⬅️ Volver al Menú']
        ]).resize()
    );
});

bot.hears('🕵️ Reporte Anónimo (VIP)', (ctx) => {
    sesiones[ctx.from.id] = { paso: 'ubicacion_tipo', datos: { fotos: [], anonimo: true, esHistoria: false } };
    ctx.reply("🕵️ **MODO INCÓGNITO**\n¿Mandamos GPS o escribís el lugar?", Markup.keyboard([['📍 Enviar GPS', '✍️ Escribir lugar'], ['❌ Cancelar']]).resize());
});

bot.hears('📖 Contar mi Historia', (ctx) => {
    sesiones[ctx.from.id] = { paso: 'descripcion', datos: { fotos: [], anonimo: true, esHistoria: true, pais: "Uruguay", ciudad: "Relato VIP" } };
    ctx.reply("📖 **ARCHIVO DE RELATOS**\nContame esa historia personal o contacto que tuviste. ¡Te escucho!");
});

// --- RANGO E IA ---
bot.hears('🎖️ Mi Rango de Investigador', (ctx) => {
    const user = db.usuarios[ctx.from.id] || { puntos: 0, reportes: 0 };
    const r = obtenerRango(user.puntos);
    let msg = `🎖️ **TU RANGO ACTUAL:**\n${r.nombre}\n\n📊 **Puntos:** ${user.puntos}\n🛸 **Reportes:** ${user.reportes}\n`;
    if (r.sig > 0) msg += `🚀 ¡Faltan ${r.sig} puntos para el próximo nivel!`;
    ctx.reply(msg, menuPrincipal());
});

bot.hears('👽 Charlar con AIFUCITO', (ctx) => {
    const id = ctx.from.id;
    sesiones[id] = { paso: 'charla_ia' };
    chatsIA[id] = model.startChat({ history: [] }); 
    ctx.reply("¡Hola! Soy AIFUCITO 🤖 ¿En qué puedo ayudarte hoy?", Markup.keyboard([['⬅️ Volver al Menú']]).resize());
});

// --- LÓGICA DE REPORTES Y MULTIMEDIA ---
bot.hears('🛸 Reportar Avistamiento', ctx => {
    sesiones[ctx.from.id] = { paso: 'ubicacion_tipo', datos: { fotos: [], anonimo: false } };
    ctx.reply("🛸 **NUEVO REPORTE**\n¿GPS o escribir lugar?", Markup.keyboard([['📍 Enviar GPS', '✍️ Escribir lugar'], ['❌ Cancelar']]).resize());
});

bot.on(['text', 'location', 'photo'], async (ctx, next) => {
    const id = ctx.from.id;
    const s = sesiones[id];
    if (!s) return next();

    const txt = ctx.message.text;
    if (txt === '❌ Cancelar' || txt === '⬅️ Volver al Menú') { 
        delete sesiones[id]; delete chatsIA[id];
        return ctx.reply("¡Entendido! Volvemos al menú principal.", menuPrincipal()); 
    }

    if (s.paso === 'charla_ia') {
        try {
            await ctx.sendChatAction('typing');
            if (!chatsIA[id]) chatsIA[id] = model.startChat({ history: [] });
            const result = await chatsIA[id].sendMessage(txt);
            return ctx.reply(result.response.text());
        } catch (e) {
            chatsIA[id] = model.startChat({ history: [] });
            return ctx.reply("¡Uy! Se me cruzaron los cables. ¿Me repetís eso?");
        }
    }

    if (s.paso === 'ubicacion_tipo') {
        if (txt === '📍 Enviar GPS') {
            s.paso = 'esperando_gps';
            return ctx.reply("Mandame tu ubicación con el botón de abajo:", Markup.keyboard([[Markup.button.locationRequest('📍 MANDAR UBICACIÓN')]]).resize());
        } else {
            s.paso = 'pais';
            return ctx.reply("¿País?", Markup.keyboard([['Uruguay', 'Argentina', 'Chile'], ['Otro (Global)']]).resize());
        }
    }

    if (s.paso === 'esperando_gps' && ctx.message.location) {
        s.datos.lat = ctx.message.location.latitude; s.datos.lng = ctx.message.location.longitude;
        s.datos.pais = "Uruguay"; s.datos.ciudad = "Ubicación GPS"; s.paso = 'descripcion';
        return ctx.reply("✅ ¡GPS recibido! Ahora contame... 👁️ **¿Qué viste?**");
    }

    if (s.paso === 'pais') { s.datos.pais = txt; s.paso = 'ciudad'; return ctx.reply("📌 **Departamento/Provincia:**"); }
    if (s.paso === 'ciudad') { s.datos.ciudad = txt; s.paso = 'barrio'; return ctx.reply("🏘️ **¿Barrio?**"); }
    if (s.paso === 'barrio') { s.datos.barrio = txt; s.paso = 'descripcion'; return ctx.reply("👁️ **¿Qué viste?**"); }

    if (s.paso === 'descripcion') {
        s.datos.descripcion = txt; s.paso = 'multimedia';
        await ctx.sendChatAction('typing');
        const promptIA = s.datos.esHistoria ? `Resume este relato: "${txt}"` : `Analiza brevemente: "${txt}". Clasifica: Nave, Luz o Paranormal.`;
        const res = await model.generateContent(promptIA);
        s.datos.analisis_ia = res.response.text();
        return ctx.reply(`${s.datos.analisis_ia}\n\n📸 Mandame las fotos que tengas y después tocá '🚀 REVISAR'.`, Markup.keyboard([['🚀 REVISAR'], ['❌ Cancelar']]).resize());
    }

    if (ctx.message.photo && s.paso === 'multimedia') {
        s.datos.fotos.push(ctx.message.photo[ctx.message.photo.length - 1].file_id);
        return ctx.reply("✅ ¡Foto guardada!");
    }

    if (txt === '🚀 REVISAR') {
        s.paso = 'confirmacion';
        const titulo = s.datos.esHistoria ? "📖 RELATO VIP" : "📋 FICHA OMEGA";
        const resumen = `${titulo}\n📍 ${s.datos.pais}, ${s.datos.ciudad}\n👁️ ${s.datos.descripcion}\n🧠 ${s.datos.analisis_ia}${s.datos.anonimo ? '\n🕵️ (ANÓNIMO)' : ''}`;
        return ctx.reply(resumen, Markup.keyboard([['✅ CONFIRMAR Y ENVIAR', '❌ DESCARTAR']]).resize());
    }

    if (txt === '✅ CONFIRMAR Y ENVIAR') {
        if (!db.usuarios[id]) db.usuarios[id] = { nombre: ctx.from.first_name, puntos: 0, reportes: 0 };
        db.usuarios[id].puntos += 10; db.usuarios[id].reportes += 1; guardarDB();
        await publicarYGuardar(s.datos, ctx);
        delete sesiones[id];
        ctx.reply(`✅ **¡ENVIADO!** Sumaste 10 puntos.`, menuPrincipal());
    }
});

async function publicarYGuardar(datos, ctx) {
    const CANALES = { "Uruguay": "-1003826671445", "Argentina": "-1003750025728", "Chile": "-1003811532520", "Otro (Global)": "-1003820597313", "RadarConoSur": "-1003759731798" };
    const canal = CANALES[datos.pais] || CANALES["Otro (Global)"];
    
    const nombrePublico = datos.anonimo ? "Testigo Anónimo 🕵️" : ctx.from.first_name;
    const cabecera = datos.esHistoria ? "📖 **HISTORIA VIP**" : "🛸 **REPORTE AIFU**";
    const ficha = `${cabecera}\n👤 ${nombrePublico}\n📍 ${datos.pais} - ${datos.ciudad}\n👁️ ${datos.descripcion}\n🔍 ${datos.analisis_ia}`;

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
