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

// Inicialización de DB con soporte para Historias VIP
let db = { usuarios: {}, historias_vip: [] };
if (fs.existsSync(DB_FILE)) {
    const data = JSON.parse(fs.readFileSync(DB_FILE));
    db = { ...db, ...data };
}
const guardarDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

const obtenerRango = (puntos) => {
    if (puntos < 30) return { nombre: "🧻 Fajinador de Retretes Espaciales", sig: 30 - puntos };
    if (puntos < 100) return { nombre: "🧉 Cebador de Mate Intergaláctico", sig: 100 - puntos };
    if (puntos < 250) return { nombre: "👽 Traductor de Dialectos Marcianos", sig: 250 - puntos };
    if (puntos < 500) return { nombre: "🔭 Cazador de Luces de Boliche", sig: 500 - puntos };
    if (puntos < 1000) return { nombre: "🛸 Piloto de Plato Volador a Pedal", sig: 1000 - puntos };
    return { nombre: "👨‍🚀 COMANDANTE ESPACIAL AIFULOGO", sig: 0 };
};

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/reportes.json', (req, res) => {
    if (fs.existsSync(MAP_FILE)) res.json(JSON.parse(fs.readFileSync(MAP_FILE)));
    else res.json([]);
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 AIFUCITO 5.0 - RADAR ACTIVO`));

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "Eres AIFUCITO, asistente de AIFU Uruguay. Si es una historia, genera un TÍTULO corto y misterioso. Si es avistamiento, analiza Nave/Luz/Paranormal."
});

let sesiones = {};
let chatsIA = {}; 

const menuPrincipal = () => Markup.keyboard([
    ['🛸 Reportar Avistamiento', '🗺️ Ver Mapa Táctico'],
    ['🎖️ Mi Rango de Investigador', '👽 Charlar con AIFUCITO'],
    ['💳 Hazte Socio / VIP', '🔗 Red de Canales'],
    ['ℹ️ Sobre AIFU']
]).resize();

bot.start((ctx) => {
    const id = ctx.from.id;
    if (!db.usuarios[id]) db.usuarios[id] = { nombre: ctx.from.first_name, puntos: 0, reportes: 0 };
    guardarDB();
    const r = obtenerRango(db.usuarios[id].puntos);
    ctx.reply(`¡Hola! 👋 Soy AIFUCITO.\n\nTu rango: ${r.nombre}.`, menuPrincipal());
});

bot.hears('🔗 Red de Canales', (ctx) => {
    const redMsg = "🌍 **RED DE MONITOREO AIFU:**\n\n" +
                  "🇺🇾 [AIFU Uruguay](https://t.me/AIFU_Uruguay)\n" +
                  "🇦🇷 [AIFU Argentina](https://t.me/AIFU_Argentina)\n" +
                  "🇨🇱 [AIFU Chile](https://t.me/AIFU_Chile)\n" +
                  "🌐 [AIFU Global](https://t.me/AIFU_Global)\n" +
                  "🛰️ **[RADAR CENTRAL](https://t.me/RadarConoSur)**";
    ctx.reply(redMsg, { parse_mode: 'Markdown', disable_web_page_preview: true });
});

bot.hears('💳 Hazte Socio / VIP', (ctx) => {
    ctx.reply("🌟 **ZONA VIP**", Markup.keyboard([
        ['📖 Contar mi Historia', '📚 Bóveda de Historias'],
        ['🕵️ Reporte Anónimo (VIP)', '⬅️ Volver al Menú']
    ]).resize());
});

bot.hears('📚 Bóveda de Historias', (ctx) => {
    if (db.historias_vip.length === 0) return ctx.reply("La bóveda está cerrada. No hay historias aún.");
    let lista = "📂 **ARCHIVOS VIP CLASIFICADOS**\n\n";
    db.historias_vip.forEach((h, i) => lista += `${i + 1}. 🛸 ${h.titulo}\n`);
    lista += "\nEscribí el número para leer el relato completo:";
    sesiones[ctx.from.id] = { paso: 'leyendo_vip' };
    ctx.reply(lista);
});

bot.hears('🕵️ Reporte Anónimo (VIP)', (ctx) => {
    sesiones[ctx.from.id] = { paso: 'ubicacion_tipo', datos: { fotos: [], anonimo: true, esHistoria: false } };
    ctx.reply("🕵️ **MODO ANÓNIMO**\n¿GPS o escribís lugar?", Markup.keyboard([['📍 Enviar GPS', '✍️ Escribir lugar'], ['❌ Cancelar']]).resize());
});

bot.hears('📖 Contar mi Historia', (ctx) => {
    sesiones[ctx.from.id] = { paso: 'descripcion', datos: { fotos: [], anonimo: true, esHistoria: true } };
    ctx.reply("📖 **TU HISTORIA VIP**\nContame tu experiencia (Máx 500 palabras):");
});

bot.on(['text', 'location', 'photo'], async (ctx, next) => {
    const id = ctx.from.id;
    const s = sesiones[id];
    if (!s) return next();
    const txt = ctx.message.text;

    if (txt === '❌ Cancelar' || txt === '⬅️ Volver al Menú') { 
        delete sesiones[id]; delete chatsIA[id];
        return ctx.reply("Volvemos al inicio.", menuPrincipal()); 
    }

    if (s.paso === 'leyendo_vip') {
        const index = parseInt(txt) - 1;
        if (db.historias_vip[index]) {
            const h = db.historias_vip[index];
            await ctx.reply(`✨ **${h.titulo}**\n\n${h.relato}`);
            delete sesiones[id];
            return ctx.reply("¿Querés leer otra?", menuPrincipal());
        }
    }

    if (s.paso === 'ubicacion_tipo') {
        if (txt === '📍 Enviar GPS') {
            s.paso = 'esperando_gps';
            return ctx.reply("Mandame el GPS:", Markup.keyboard([[Markup.button.locationRequest('📍 MANDAR UBICACIÓN')]]).resize());
        } else {
            s.paso = 'pais';
            return ctx.reply("¿País?", Markup.keyboard([['Uruguay', 'Argentina', 'Chile'], ['Otro (Global)']]).resize());
        }
    }

    if (s.paso === 'esperando_gps' && ctx.message.location) {
        const { latitude: lat, longitude: lng } = ctx.message.location;
        s.datos.lat = lat; s.datos.lng = lng;
        if (lat < -30 && lat > -35 && lng < -59 && lng > -53) s.datos.pais = "Uruguay";
        else if (lat < -21 && lat > -55 && lng < -73 && lng > -53) s.datos.pais = "Argentina";
        else if (lat < -17 && lat > -56 && lng < -76 && lng > -66) s.datos.pais = "Chile";
        else s.datos.pais = "Otro (Global)";
        s.datos.ciudad = "Ubicación GPS"; s.paso = 'descripcion';
        return ctx.reply(`✅ Localizado en: ${s.datos.pais}.\n👁️ **¿Qué viste?**`);
    }

    if (s.paso === 'pais') { s.datos.pais = txt; s.paso = 'ciudad'; return ctx.reply("📌 **Departamento/Provincia:**"); }
    if (s.paso === 'ciudad') { s.datos.ciudad = txt; s.paso = 'barrio'; return ctx.reply("🏘️ **Barrio:**"); }
    if (s.paso === 'barrio') { s.datos.barrio = txt; s.paso = 'descripcion'; return ctx.reply("👁️ **¿Qué viste?**"); }

    if (s.paso === 'descripcion') {
        if (s.datos.esHistoria && txt.split(/\s+/).length > 500) {
            return ctx.reply("⚠️ La historia es muy larga (máx 500 palabras). Resumila un poco.");
        }
        s.datos.descripcion = txt;
        await ctx.sendChatAction('typing');
        const promptIA = s.datos.esHistoria ? `Genera un título corto y atrapante para esta historia: "${txt}"` : `Analiza brevemente: "${txt}". Clasifica como Nave, Luz o Paranormal.`;
        const res = await model.generateContent(promptIA);
        s.datos.analisis_ia = res.response.text().trim();
        
        if (s.datos.esHistoria) {
            s.paso = 'confirmacion_vip';
            return ctx.reply(`📝 **Título sugerido:** ${s.datos.analisis_ia}\n\n¿Guardamos esta historia en la Bóveda VIP?`, Markup.keyboard([['✅ GUARDAR EN BÓVEDA', '❌ DESCARTAR']]).resize());
        } else {
            s.paso = 'multimedia';
            return ctx.reply(`${s.datos.analisis_ia}\n\n📸 Mandá fotos y tocá '🚀 REVISAR'.`, Markup.keyboard([['🚀 REVISAR'], ['❌ Cancelar']]).resize());
        }
    }

    if (ctx.message.photo && s.paso === 'multimedia') {
        s.datos.fotos.push(ctx.message.photo[ctx.message.photo.length - 1].file_id);
        return ctx.reply("✅ Foto recibida.");
    }

    if (txt === '🚀 REVISAR') {
        s.paso = 'confirmacion';
        const resumen = `📋 **FICHA REPORTE**\n📍 ${s.datos.pais}\n👁️ ${s.datos.descripcion}\n🧠 ${s.datos.analisis_ia}`;
        return ctx.reply(resumen, Markup.keyboard([['✅ CONFIRMAR Y ENVIAR', '❌ DESCARTAR']]).resize());
    }

    if (txt === '✅ GUARDAR EN BÓVEDA' && s.paso === 'confirmacion_vip') {
        db.historias_vip.push({ titulo: s.datos.analisis_ia, relato: s.datos.descripcion, id_user: id });
        guardarDB();
        delete sesiones[id];
        return ctx.reply("🚀 **RELATO GUARDADO.** Ya está disponible en la Bóveda para los socios.", menuPrincipal());
    }

    if (txt === '✅ CONFIRMAR Y ENVIAR') {
        ctx.reply("🚀 Subiendo reporte...");
        if (!db.usuarios[id]) db.usuarios[id] = { nombre: ctx.from.first_name, puntos: 0, reportes: 0 };
        db.usuarios[id].puntos += 10; db.usuarios[id].reportes += 1; guardarDB();
        await publicarYGuardar(s.datos, ctx);
        delete sesiones[id];
        ctx.reply(`✅ **¡ENVIADO AL RADAR!**`, menuPrincipal());
    }
});

async function publicarYGuardar(datos, ctx) {
    if (datos.esHistoria) return; // Las historias NO van a los canales
    const CANALES = { "Uruguay": "-1003826671445", "Argentina": "-1003750025728", "Chile": "-1003811532520", "Otro (Global)": "-1003820597313", "RadarConoSur": "-1003759731798" };
    const canal = CANALES[datos.pais] || CANALES["Otro (Global)"];
    const autor = datos.anonimo ? "Testigo Anónimo 🕵️" : ctx.from.first_name;
    const ficha = `🛸 **REPORTE AIFU**\n👤 ${autor}\n📍 ${datos.pais} - ${datos.ciudad}\n👁️ ${datos.descripcion}\n🔍 ${datos.analisis_ia}`;

    let puntosMap = [];
    if (fs.existsSync(MAP_FILE)) puntosMap = JSON.parse(fs.readFileSync(MAP_FILE));
    puntosMap.push({ lat: datos.lat || -34.8, lng: datos.lng || -56.1, desc: `${datos.ciudad}: ${datos.descripcion.substring(0,30)}` });
    fs.writeFileSync(MAP_FILE, JSON.stringify(puntosMap));

    try {
        for (const f of datos.fotos) { 
            await bot.telegram.sendPhoto(canal, f);
            await bot.telegram.sendPhoto(CANALES["RadarConoSur"], f);
            await new Promise(r => setTimeout(r, 1000)); 
        }
        await bot.telegram.sendMessage(canal, ficha);
        await bot.telegram.sendMessage(CANALES["RadarConoSur"], ficha);
    } catch (e) { console.log("Error:", e); }
}

bot.launch();
