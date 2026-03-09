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
    if (fs.existsSync(MAP_FILE)) {
        res.json(JSON.parse(fs.readFileSync(MAP_FILE)));
    } else {
        res.json([]);
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 AIFUCITO 5.0 ACTIVO`));

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "Eres AIFUCITO, jefe de investigación de AIFU Uruguay. Tono humano, compañero y apasionado. Usa términos como 'compañero' o 'mate'. Habla como un uruguayo de campo, serio con la evidencia pero amable."
});

let sesiones = {};
let chatsIA = {}; 

const menuPrincipal = () => Markup.keyboard([
    ['🛸 Reportar Avistamiento', '🗺️ Ver Mapa Táctico'],
    ['👤 Mi Perfil de Investigador', '👽 Charlar con AIFUCITO'],
    ['💳 Hazte Socio / VIP', 'ℹ️ Sobre AIFU']
]).resize();

bot.start((ctx) => {
    const id = ctx.from.id;
    if (!db.usuarios[id]) db.usuarios[id] = { nombre: ctx.from.first_name, puntos: 0, reportes: 0 };
    guardarDB();
    ctx.reply(`¡Buenas, ${ctx.from.first_name}! 🧉 Bienvenido a la central 5.0. Tu rango actual: ${obtenerRango(db.usuarios[id].puntos).nombre}. ¿Qué viste hoy?`, menuPrincipal());
});

bot.hears('ℹ️ Sobre AIFU', (ctx) => ctx.reply("✨ **AIFU:** Asociación de Investigadores de Fenómenos Uruguayos. Investigamos lo que otros ignoran. Contacto: aifuoficial@gmail.com"));

// --- MEJORA: SECCIÓN VIP INTEGRADA ---
bot.hears('💳 Hazte Socio / VIP', (ctx) => {
    ctx.reply(
        "🌟 **ZONA VIP (Solo usuarios y lectores VIP)**\n\nEn esta sección puedes contar tu historia personal o contacto de manera anónima para los canales. Nosotros guardaremos el registro histórico, pero tu identidad será protegida en la publicación.",
        Markup.keyboard([
            ['📖 Contar mi Historia (Anónimo)'], 
            ['⬅️ Volver al Menú']
        ]).resize()
    );
});

bot.hears('📖 Contar mi Historia (Anónimo)', (ctx) => {
    sesiones[ctx.from.id] = { 
        paso: 'descripcion', 
        datos: { fotos: [], anonimo: true, esHistoria: true, pais: "Uruguay", ciudad: "Relato VIP" } 
    };
    ctx.reply("🕵️ **ARCHIVO CONFIDENCIAL AIFU**\nAdelante, compañero. Contame tu historia o contacto con libertad. ¿Qué pasó?");
});

bot.hears('👤 Mi Perfil de Investigador', (ctx) => {
    const user = db.usuarios[ctx.from.id] || { puntos: 0, reportes: 0 };
    const rango = obtenerRango(user.puntos);
    let msg = `👤 **FICHA TÉCNICA AIFU**\n━━━━━━━━━━━━\n🧔 **Investigador:** ${ctx.from.first_name}\n🎖️ **Rango:** ${rango.nombre}\n📊 **Puntos:** ${user.puntos}\n🛸 **Reportes:** ${user.reportes}\n━━━━━━━━━━━━\n`;
    msg += rango.sig > 0 ? `🚀 Te faltan ${rango.sig} puntos para el próximo nivel.` : `👑 ¡Rango Máximo!`;
    ctx.reply(msg, menuPrincipal());
});

bot.hears('👽 Charlar con AIFUCITO', (ctx) => {
    const id = ctx.from.id;
    sesiones[id] = { paso: 'charla_ia' };
    chatsIA[id] = model.startChat({ history: [] }); 
    ctx.reply("Dale, compañero. ¿Qué tenés en mente? (Tocá volver al menú para salir)", Markup.keyboard([['⬅️ Volver al Menú']]).resize());
});

bot.hears('🗺️ Ver Mapa Táctico', (ctx) => {
    const urlMapa = `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'aifucito5-0.onrender.com'}`;
    ctx.replyWithHTML(`📍 <b>RADAR OMEGA</b>\nPodés ver los puntos calientes en tiempo real.`, 
        Markup.inlineKeyboard([[Markup.button.url('🌐 ABRIR RADAR', urlMapa)]]));
});

bot.hears('🛸 Reportar Avistamiento', ctx => {
    sesiones[ctx.from.id] = { paso: 'ubicacion_tipo', datos: { fotos: [], anonimo: false } };
    ctx.reply("🛸 **NUEVO REGISTRO**\n¿Querés mandarme tu ubicación GPS o preferís escribir el lugar?", 
        Markup.keyboard([['📍 Enviar GPS', '✍️ Escribir lugar'], ['❌ Cancelar']]).resize().oneTime());
});

bot.on(['text', 'location', 'photo'], async (ctx, next) => {
    const id = ctx.from.id;
    const s = sesiones[id];
    if (!s) return next();

    const txt = ctx.message.text;
    if (txt === '❌ Cancelar' || txt === '⬅️ Volver al Menú') { 
        delete sesiones[id]; 
        delete chatsIA[id];
        return ctx.reply("Entendido. Volvemos al inicio.", menuPrincipal()); 
    }

    // --- CHARLA CON IA ---
    if (s.paso === 'charla_ia') {
        try {
            await ctx.sendChatAction('typing');
            if (!chatsIA[id]) chatsIA[id] = model.startChat({ history: [] });
            const result = await chatsIA[id].sendMessage(txt);
            return ctx.reply(result.response.text());
        } catch (e) {
            return ctx.reply("Se me cortó la señal, compañero. ¿Qué decías?");
        }
    }

    // --- LÓGICA DE REPORTE ---
    if (s.paso === 'ubicacion_tipo') {
        if (txt === '📍 Enviar GPS') {
            s.paso = 'esperando_gps';
            return ctx.reply("Tocá el botón abajo para mandar tu posición:", Markup.keyboard([[Markup.button.locationRequest('📍 MANDAR UBICACIÓN')]]).resize());
        } else {
            s.paso = 'pais';
            return ctx.reply("¿En qué país fue?", Markup.keyboard([['Uruguay', 'Argentina', 'Chile'], ['Otro (Global)', '❌ Cancelar']]).resize());
        }
    }

    // SALTO DIRECTO SI HAY GPS
    if (s.paso === 'esperando_gps' && ctx.message.location) {
        s.datos.lat = ctx.message.location.latitude;
        s.datos.lng = ctx.message.location.longitude;
        s.datos.pais = "Uruguay"; 
        s.datos.ciudad = "Ubicación GPS"; 
        s.datos.barrio = "Coordenadas directas";
        s.paso = 'descripcion'; 
        return ctx.reply("✅ Posición capturada por GPS. Ahora sí, contame: 👁️ **¿Qué viste?**");
    }

    if (s.paso === 'pais') { s.datos.pais = txt; s.paso = 'ciudad'; return ctx.reply("📌 **Departamento o Provincia:**"); }
    if (s.paso === 'ciudad') { s.datos.ciudad = txt; s.paso = 'barrio'; return ctx.reply("🏘️ **¿Barrio o paraje?**"); }
    if (s.paso === 'barrio') { s.datos.barrio = txt; s.paso = 'descripcion'; return ctx.reply("👁️ **¿Qué viste?** Contame tu relato."); }

    if (s.paso === 'descripcion') {
        s.datos.descripcion = txt; s.paso = 'multimedia';
        await ctx.sendChatAction('typing');
        // Ajustamos el análisis según si es historia o reporte
        const promptIA = s.datos.esHistoria ? `Resume este relato personal de forma breve: "${txt}"` : `Analiza: "${txt}". Clasifica: Nave, Luz o Paranormal. Sé breve y humano.`;
        const res = await model.generateContent(promptIA);
        s.datos.analisis_ia = res.response.text();
        return ctx.reply(`${s.datos.analisis_ia}\n\n📸 Mandame evidencia (fotos). Cuando termines, dale a '🚀 REVISAR'.`, Markup.keyboard([['🚀 REVISAR'], ['❌ Cancelar']]).resize());
    }

    if (ctx.message.photo && s.paso === 'multimedia') {
        s.datos.fotos.push(ctx.message.photo[ctx.message.photo.length - 1].file_id);
        return ctx.reply("✅ Foto guardada.");
    }

    if (txt === '🚀 REVISAR') {
        s.paso = 'confirmacion';
        const titulo = s.datos.esHistoria ? "📖 REVISIÓN DE RELATO VIP" : "📋 FICHA OMEGA";
        const resumen = `${titulo}\n📍 ${s.datos.pais}, ${s.datos.ciudad}\n👁️ ${s.datos.descripcion}\n🧠 ${s.datos.analisis_ia}${s.datos.anonimo ? '\n🕵️ MODO ANÓNIMO ACTIVO' : ''}`;
        return ctx.reply(resumen, Markup.keyboard([['✅ CONFIRMAR Y ENVIAR', '❌ DESCARTAR']]).resize());
    }

    if (txt === '✅ CONFIRMAR Y ENVIAR') {
        if (!db.usuarios[id]) db.usuarios[id] = { nombre: ctx.from.first_name, puntos: 0, reportes: 0 };
        db.usuarios[id].puntos += 10;
        db.usuarios[id].reportes += 1;
        guardarDB();

        await publicarYGuardar(s.datos, ctx);
        delete sesiones[id];
        ctx.reply(`✅ **ENVIADO.** Sumaste 10 puntos. Rango: ${obtenerRango(db.usuarios[id].puntos).nombre}`, menuPrincipal());
    }
});

async function publicarYGuardar(datos, ctx) {
    const CANALES = { 
        "Uruguay": "-1003826671445", 
        "Argentina": "-1003750025728", 
        "Chile": "-1003811532520", 
        "Otro (Global)": "-1003820597313", 
        "RadarConoSur": "-1003759731798" 
    };
    const canal = CANALES[datos.pais] || CANALES["Otro (Global)"];
    
    // Si es historia VIP, el nombre es anónimo. Si es reporte normal, lleva el nombre del investigador.
    const nombreParaMostrar = datos.anonimo ? "Testigo Anónimo 🕵️" : ctx.from.first_name;
    const encabezado = datos.esHistoria ? "📖 **NUEVA HISTORIA VIP**" : "🛸 **REPORTE AIFU**";
    
    const ficha = `${encabezado}\n👤 ${nombreParaMostrar}\n📍 ${datos.pais} - ${datos.ciudad}\n👁️ ${datos.descripcion}\n🔍 ${datos.analisis_ia}`;

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
    } catch (e) { console.log("Error de envío:", e); }
}

bot.launch();
