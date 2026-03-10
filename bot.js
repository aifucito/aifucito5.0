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

/* =========================
   SISTEMA DE ARCHIVOS Y DISCO
========================= */
const DATA_DIR = '/data';
let DB_FILE, MAP_FILE;

if (fs.existsSync(DATA_DIR)) {
    console.log("✅ DISCO PERSISTENTE /data CONECTADO");
    DB_FILE = path.join(DATA_DIR, 'base_datos_aifu.json');
    MAP_FILE = path.join(DATA_DIR, 'reportes.json');
} else {
    console.log("⚠️ MODO EMERGENCIA: Guardando en carpeta local");
    DB_FILE = path.join(__dirname, 'base_datos_aifu.json');
    MAP_FILE = path.join(__dirname, 'reportes.json');
}

// Inicializar archivos
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ usuarios: {}, historias_vip: [] }));
if (!fs.existsSync(MAP_FILE)) fs.writeFileSync(MAP_FILE, JSON.stringify([]));

let db = JSON.parse(fs.readFileSync(DB_FILE));
const guardarDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

const guardarReporteMapa = (reporte) => {
    const data = JSON.parse(fs.readFileSync(MAP_FILE));
    data.push({
        ...reporte,
        id: Date.now(),
        fecha: new Date().toISOString()
    });
    fs.writeFileSync(MAP_FILE, JSON.stringify(data, null, 2));
    console.log("📍 MAPA ACTUALIZADO: Nuevo punto guardado.");
};

/* =========================
   SERVIDOR DEL RADAR (WEB)
========================= */
app.use(express.static(path.join(__dirname, 'public')));
app.get('/reportes.json', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(MAP_FILE);
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 RADAR WEB EN PUERTO ${PORT}`));

/* =========================
   BOT DE TELEGRAM (FLUJO DE REPORTE)
========================= */
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
let sesiones = {};

const menuPrincipal = () =>
    Markup.keyboard([
        ['🛸 Reportar Avistamiento', '🗺️ Ver Mapa Táctico'],
        ['🎖️ Mi Rango', '💳 Hazte Socio / VIP'],
        ['🔗 Red de Canales', 'ℹ️ Sobre AIFU']
    ]).resize();

bot.start((ctx) => {
    const id = ctx.from.id;
    if (!db.usuarios[id]) db.usuarios[id] = { nombre: ctx.from.first_name, puntos: 0 };
    guardarDB();
    ctx.reply(`🛸 ¡Bienvenido Investigador ${ctx.from.first_name}! Sistema listo para reportes.`, menuPrincipal());
});

bot.hears('🗺️ Ver Mapa Táctico', (ctx) => {
    ctx.reply(`🛰️ ACCESO AL RADAR:\n🌎 ${process.env.RADAR_URL || "Revisa tu URL de Render"}`);
});

bot.hears('🛸 Reportar Avistamiento', (ctx) => {
    sesiones[ctx.from.id] = { 
        paso: 'tipo_ubicacion', 
        datos: { fotos: [], pais: "", ciudad: "", barrio: "", descripcion: "", lat: null, lng: null } 
    };
    ctx.reply("🛸 Iniciando Reporte. ¿Cómo quieres indicar la ubicación?", 
        Markup.keyboard([['📍 Enviar GPS', '✍️ Escribir lugar'], ['❌ Cancelar']]).resize());
});

bot.on(['text', 'location', 'photo'], async (ctx, next) => {
    const id = ctx.from.id;
    const s = sesiones[id];
    if (!s) return next();

    const txt = ctx.message.text;
    if (txt === '❌ Cancelar') { delete sesiones[id]; return ctx.reply("Reporte cancelado.", menuPrincipal()); }

    // Paso 1: Ubicación
    if (s.paso === 'tipo_ubicacion') {
        if (txt === '📍 Enviar GPS') {
            s.paso = 'esperando_gps';
            return ctx.reply("Por favor, envía tu ubicación actual desde el clip 📎", Markup.keyboard([[Markup.button.locationRequest('📍 COMPARTIR MI GPS')]]).resize());
        }
        s.paso = 'pais';
        return ctx.reply("¿En qué país ocurrió?", Markup.keyboard([['Uruguay', 'Argentina', 'Chile']]).resize());
    }

    // Paso GPS
    if (s.paso === 'esperando_gps' && ctx.message.location) {
        s.datos.lat = ctx.message.location.latitude;
        s.datos.lng = ctx.message.location.longitude;
        s.datos.pais = "Uruguay"; // Por defecto o detección
        s.datos.ciudad = "Ubicación GPS";
        s.datos.barrio = "Detectado por satélite";
        s.paso = 'descripcion';
        return ctx.reply("✅ Ubicación recibida. Ahora describe qué estás viendo:", Markup.keyboard([['❌ Cancelar']]).resize());
    }

    // Pasos Texto
    if (s.paso === 'pais') { s.datos.pais = txt; s.paso = 'ciudad'; return ctx.reply("📌 ¿En qué Ciudad o Departamento?"); }
    if (s.paso === 'ciudad') { s.datos.ciudad = txt; s.paso = 'barrio'; return ctx.reply("🏠 ¿Qué Barrio o Zona específica?"); }
    if (s.paso === 'barrio') { s.datos.barrio = txt; s.paso = 'descripcion'; return ctx.reply("👁️ Describe el fenómeno (forma, luces, movimiento):"); }

    // Descripción y Fotos
    if (s.paso === 'descripcion') {
        s.datos.descripcion = txt;
        s.paso = 'multimedia';
        return ctx.reply("📸 Envía las fotos del avistamiento. Cuando termines, presiona REVISAR.", Markup.keyboard([['🚀 REVISAR'], ['❌ Cancelar']]).resize());
    }

    if (ctx.message.photo && s.paso === 'multimedia') {
        const fotoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        s.datos.fotos.push(fotoId);
        return ctx.reply("✅ Foto añadida al reporte.");
    }

    // Revisión Final
    if (txt === '🚀 REVISAR') {
        s.paso = 'confirmacion';
        const resumen = `📋 REVISIÓN DE REPORTE\n📍 ${s.datos.pais}, ${s.datos.ciudad}\n🏠 Barrio: ${s.datos.barrio}\n📝 Detalle: ${s.datos.descripcion}\n🖼️ Fotos: ${s.datos.fotos.length}`;
        return ctx.reply(resumen, Markup.keyboard([['✅ ENVIAR AL RADAR', '❌ DESCARTAR']]).resize());
    }

    if (txt === '✅ ENVIAR AL RADAR') {
        await finalizarYEnviar(s.datos, ctx);
        delete sesiones[id];
    }
    
    if (txt === '❌ DESCARTAR') { delete sesiones[id]; return ctx.reply("Reporte eliminado.", menuPrincipal()); }
});

async function finalizarYEnviar(datos, ctx) {
    const CANALES = { Uruguay: "-1003826671445", Argentina: "-1003750025728", Chile: "-1003811532520" };
    const canalDestino = CANALES[datos.pais] || "-1003820597313";
    const mensaje = `🛸 ¡AVISTAMIENTO REPORTADO!\n📍 ${datos.pais}, ${datos.ciudad}\n🏠 ${datos.barrio}\n📝 ${datos.descripcion}`;

    try {
        // Enviar a Canales
        for (const f of datos.fotos) {
            await bot.telegram.sendPhoto(canalDestino, f);
        }
        await bot.telegram.sendMessage(canalDestino, mensaje);
        await bot.telegram.sendMessage("-1003759731798", mensaje); // Central

        // Guardar en el Mapa y Puntos
        guardarReporteMapa(datos);
        if (db.usuarios[ctx.from.id]) db.usuarios[ctx.from.id].puntos += 10;
        guardarDB();

        ctx.reply("✅ ¡Éxito! Tu reporte ya está en el mapa y en los canales oficiales.", menuPrincipal());
    } catch (e) {
        console.error(e);
        ctx.reply("⚠️ El reporte se guardó pero hubo un problema al publicar en Telegram.");
    }
}

bot.launch().then(() => console.log("📡 AIFU URUGUAY: MOTOR DE REPORTES ACTIVO"));
