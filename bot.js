import { Telegraf, Markup } from 'telegraf';
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

// --- FUNCIÓN DE IA: RUTA TÉCNICA COMPLETA ---
async function llamarIA(mensaje) {
    const API_KEY = process.env.GEMINI_API_KEY;
    // URL con la ruta completa del modelo: models/gemini-1.5-flash
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;
    
    const payload = {
        contents: [{
            parts: [
                { text: "Eres AIFUCITO, asistente de AIFU Uruguay. Respondé corto y con onda. Sos el bot oficial de Damián." },
                { text: mensaje }
            ]
        }]
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    
    if (data.error) {
        console.error("ERROR GOOGLE:", data.error.message);
        throw new Error(data.error.message);
    }
    
    return data.candidates[0].content.parts[0].text;
}

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/reportes.json', (req, res) => {
    if (fs.existsSync(MAP_FILE)) res.json(JSON.parse(fs.readFileSync(MAP_FILE)));
    else res.json([]);
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 AIFUCITO 5.0 - RADAR ACTIVO`));

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
let sesiones = {};

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
    delete sesiones[id];
    const r = obtenerRango(db.usuarios[id].puntos);
    ctx.reply(`¡Hola ${ctx.from.first_name}! 👋 Soy AIFUCITO.\n\nTu rango: ${r.nombre}.`, menuPrincipal());
});

bot.hears('🔗 Red de Canales', (ctx) => {
    const redMsg = "🌍 **RED DE MONITOREO AIFU**\n\n" +
                  "🇺🇾 [AIFU UY 🇺🇾](https://t.me/+nCVD4NsOihIyNGFh)\n" +
                  "🇦🇷 [AIFU AR 🇦🇷](https://t.me/+QpErPk26SY05OGIx)\n" +
                  "🇨🇱 [AIFU CH 🇨🇱](https://t.me/+VP2T47eLvIowNmYx)\n" +
                  "🌐 [AIFU GLOBAL 👽](https://t.me/+r5XfcJma3g03MWZh)\n" +
                  "🛰️ **[RADAR CONO SUR](https://t.me/+YqA6d3VpKv9mZjU5)**";
    ctx.reply(redMsg, { parse_mode: 'Markdown', disable_web_page_preview: true });
});

bot.hears('🛸 Reportar Avistamiento', (ctx) => {
    sesiones[ctx.from.id] = { paso: 'ubicacion_tipo', datos: { fotos: [], anonimo: false, esHistoria: false } };
    ctx.reply("🛸 **NUEVO REPORTE**\n¿Cómo indicamos el lugar?", Markup.keyboard([['📍 Enviar GPS', '✍️ Escribir lugar'], ['❌ Cancelar']]).resize());
});

bot.hears('🎖️ Mi Rango de Investigador', (ctx) => {
    const user = db.usuarios[ctx.from.id] || { puntos: 0 };
    const r = obtenerRango(user.puntos);
    ctx.reply(`🎖️ **ESTADO:**\n\n🏅 Rango: ${r.nombre}\n✨ Puntos: ${user.puntos}\n🚀 Siguiente nivel en: ${r.sig} puntos.`);
});

bot.hears('🗺️ Ver Mapa Táctico', (ctx) => {
    ctx.reply("🗺️ **ACCESO AL RADAR**\nhttps://aifucito5-0.onrender.com");
});

bot.hears('ℹ️ Sobre AIFU', (ctx) => {
    ctx.reply("🛸 **AIFU - Uruguay**\nAsociación de Investigadores de Fenómenos Uruguayos.\nLiderando la investigación de campo en el Cono Sur.");
});

bot.hears('👽 Charlar con AIFUCITO', (ctx) => {
    sesiones[ctx.from.id] = { paso: 'charlar_ia' };
    ctx.reply("👽 **MODO IA ACTIVADO**\nPreguntame lo que quieras sobre el fenómeno.", Markup.keyboard([['❌ Cancelar']]).resize());
});

bot.hears('💳 Hazte Socio / VIP', (ctx) => {
    ctx.reply("🌟 **ZONA VIP**", Markup.keyboard([
        ['📖 Contar mi Historia', '📚 Bóveda de Historias'],
        ['🕵️ Reporte Anónimo (VIP)', '⬅️ Volver al Menú']
    ]).resize());
});

bot.hears('⬅️ Volver al Menú', (ctx) => {
    delete sesiones[id];
    ctx.reply("Volviendo...", menuPrincipal());
});

bot.on(['text', 'location', 'photo'], async (ctx, next) => {
    const id = ctx.from.id;
    const s = sesiones[id];
    const txt = ctx.message.text;

    if (txt === '❌ Cancelar') { delete sesiones[id]; return ctx.reply("Cancelado.", menuPrincipal()); }
    if (!s) return next();

    if (s.paso === 'charlar_ia') {
        await ctx.sendChatAction('typing');
        try {
            const respuesta = await llamarIA(txt);
            ctx.reply(respuesta);
        } catch (e) { 
            console.error("ERROR IA:", e.message);
            ctx.reply(`⚠️ Interferencia: ${e.message.substring(0, 80)}`); 
        }
        return;
    }

    if (s.paso === 'leyendo_vip') {
        const index = parseInt(txt) - 1;
        if (db.historias_vip && db.historias_vip[index]) {
            await ctx.reply(`✨ **${db.historias_vip[index].titulo}**\n\n${db.historias_vip[index].relato}`);
            delete sesiones[id];
            return ctx.reply("¿Algo más?", menuPrincipal());
        }
    }

    if (s.paso === 'ubicacion_tipo') {
        if (txt === '📍 Enviar GPS') {
            s.paso = 'esperando_gps';
            return ctx.reply("Mandame tu GPS:", Markup.keyboard([[Markup.button.locationRequest('📍 MANDAR MI GPS')]]).resize());
        } else {
            s.paso = 'pais';
            return ctx.reply("¿País?", Markup.keyboard([['Uruguay', 'Argentina', 'Chile'], ['Otro (Global)']]).resize());
        }
    }

    if (s.paso === 'esperando_gps' && ctx.message.location) {
        s.datos.lat = ctx.message.location.latitude; s.datos.lng = ctx.message.location.longitude;
        s.datos.pais = "Detectado GPS"; s.datos.ciudad = "Coordenadas"; s.paso = 'descripcion';
        return ctx.reply("✅ GPS recibido. 👁️ **¿Qué viste?**");
    }

    if (s.paso === 'pais') { s.datos.pais = txt; s.paso = 'ciudad'; return ctx.reply("📌 **Ciudad/Depto:**"); }
    if (s.paso === 'ciudad') { s.datos.ciudad = txt; s.paso = 'descripcion'; return ctx.reply("👁️ **¿Qué viste?**"); }

    if (s.paso === 'descripcion') {
        s.datos.descripcion = txt;
        await ctx.sendChatAction('typing');
        try {
            const prompt = s.datos.esHistoria ? `Título corto: ${txt}` : `Analiza breve: ${txt}`;
            const respuestaIA = await llamarIA(prompt);
            s.datos.analisis_ia = respuestaIA.trim();
        } catch (e) { 
            console.error("ERROR ANALISIS:", e.message);
            s.datos.analisis_ia = "Analizando... (IA en espera)"; 
        }
        
        if (s.datos.esHistoria) {
            s.paso = 'confirmacion_vip';
            return ctx.reply(`📝 **Título:** ${s.datos.analisis_ia}\n¿Guardamos?`, Markup.keyboard([['✅ GUARDAR EN BÓVEDA', '❌ DESCARTAR']]).resize());
        } else {
            s.paso = 'multimedia';
            return ctx.reply(`${s.datos.analisis_ia}\n📸 Mandá fotos y tocá '🚀 REVISAR'.`, Markup.keyboard([['🚀 REVISAR'], ['❌ Cancelar']]).resize());
        }
    }

    if (ctx.message.photo && s.paso === 'multimedia') {
        s.datos.fotos.push(ctx.message.photo[ctx.message.photo.length - 1].file_id);
        return ctx.reply("✅ Foto recibida.");
    }

    if (txt === '🚀 REVISAR') {
        s.paso = 'confirmacion';
        return ctx.reply(`📋 **FICHA**\n📍 ${s.datos.pais}\n👁️ ${s.datos.descripcion}`, Markup.keyboard([['✅ ENVIAR AL RADAR', '❌ DESCARTAR']]).resize());
    }

    if (txt === '✅ GUARDAR EN BÓVEDA' && s.paso === 'confirmacion_vip') {
        db.historias_vip.push({ titulo: s.datos.analisis_ia, relato: s.datos.descripcion });
        guardarDB(); delete sesiones[id];
        return ctx.reply("🚀 **Guardado.**", menuPrincipal());
    }

    if (txt === '✅ ENVIAR AL RADAR') {
        if (!db.usuarios[id]) db.usuarios[id] = { nombre: ctx.from.first_name, puntos: 0, reportes: 0 };
        db.usuarios[id].puntos += 10; guardarDB();
        await publicarYGuardar(s.datos, ctx);
        delete sesiones[id];
        ctx.reply("✅ **¡Reporte enviado!** +10 puntos.", menuPrincipal());
    }
});

async function publicarYGuardar(datos, ctx) {
    const CANALES = { "Uruguay": "-1003826671445", "Argentina": "-1003750025728", "Chile": "-1003811532520", "RadarConoSur": "-1003759731798" };
    const canal = CANALES[datos.pais] || "-1003820597313";
    const ficha = `🛸 **REPORTE AIFU**\n📍 ${datos.pais}\n👁️ ${datos.descripcion}`;

    let puntosMap = fs.existsSync(MAP_FILE) ? JSON.parse(fs.readFileSync(MAP_FILE)) : [];
    puntosMap.push({ lat: datos.lat || -34.8, lng: datos.lng || -56.1, desc: datos.descripcion.substring(0,30) });
    fs.writeFileSync(MAP_FILE, JSON.stringify(puntosMap));

    try {
        for (const f of datos.fotos) { await bot.telegram.sendPhoto(canal, f); }
        await bot.telegram.sendMessage(canal, ficha);
        await bot.telegram.sendMessage(CANALES["RadarConoSur"], ficha);
    } catch (e) { console.error(e); }
}

bot.telegram.deleteWebhook().then(() => {
    bot.launch();
});
