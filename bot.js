// ==========================================
// MÓDULO 1: IMPORTACIONES Y HERRAMIENTAS
// ==========================================
import { Telegraf, Markup } from 'telegraf';
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';
import express from 'express';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3000;

// Mantiene el bot vivo en Render
app.get('/', (req, res) => res.send('AIFUCITO 5.0 - SISTEMA ACTIVO'));
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));

// ==========================================
// MÓDULO 2: CONFIGURACIÓN DE LLAVES Y IA
// ==========================================
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "Eres AIFUCITO, investigador experto en OVNIs de AIFU Uruguay. Tu misión es entrevistar testigos de forma técnica y amable."
});

// ==========================================
// MÓDULO 3: BASE DE DATOS Y RANGOS
// ==========================================
let data = { usuarios: [], reportes: [] };
const dataPath = './data.json';

// Si ya existe información guardada, la carga
if (fs.existsSync(dataPath)) {
    data = JSON.parse(fs.readFileSync(dataPath));
}

const guardar = () => fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));

const RANGOS = [
    "Fajinero Espacial", 
    "Recluta de Radar", 
    "Cadete AIFU", 
    "Explorador del Cielo", 
    "Investigador de Campo", 
    "Oficial de Inteligencia", 
    "Comandante Intergaláctico"
];

function obtenerRango(puntos) {
    let index = Math.floor(puntos / 3); 
    return RANGOS[Math.min(index, RANGOS.length - 1)];
}

// ==========================================
// MÓDULO 4: MENÚS Y BOTONES
// ==========================================
// --- PASOS MANUALES OBLIGATORIOS ---
if (s.paso === 'pais') { 
    s.datos.pais = txt; 
    s.paso = 'ciudad'; 
    return ctx.reply("2️⃣ ¿En qué CIUDAD o PROVINCIA?"); 
}
if (s.paso === 'ciudad') { 
    s.datos.ciudad = txt; 
    s.paso = 'barrio'; 
    return ctx.reply("3️⃣ ¿En qué BARRIO o ZONA específica?"); 
}
if (s.paso === 'barrio') { 
    s.datos.barrio = txt; 
    s.paso = 'referencia'; 
    // Instrucción clara para no trabar al usuario
    return ctx.reply("4️⃣ Indica un PUNTO DE REFERENCIA (ej: 'Cerca del estadio', 'Frente al faro').\n\n👉 Si no tienes referencias, solo pon **no**."); 
}
if (s.paso === 'referencia') { 
    // Guardamos la referencia o marcamos que no hay
    s.datos.referencia = (txt.toLowerCase() === 'no') ? 'Sin referencia específica' : txt; 
    s.paso = 'descripcion'; 
    return ctx.reply("5️⃣ **DESCRIPCIÓN:** ¿Qué fenómeno observaste exactamente? (Forma, color, comportamiento)"); 
}

// ==========================================
// MÓDULO 5: LÓGICA DEL BOT (LO QUE HACE CADA BOTÓN)
// ==========================================

// --- BOTÓN START ---
bot.start(ctx => {
    let user = data.usuarios.find(u => u.id === ctx.from.id);
    if (!user) {
        user = { id: ctx.from.id, nombre: ctx.from.first_name, puntos: 0, vip: false };
        data.usuarios.push(user);
        guardar();
    }
    ctx.reply(`🛸 **AIFUCITO 5.0**\nHola ${user.nombre}, rango: ${obtenerRango(user.puntos)}`, menuPrincipal());
});

// --- BOTÓN MI PERFIL ---
bot.hears('👤 Mi Perfil', ctx => {
    const user = data.usuarios.find(u => u.id === ctx.from.id);
    ctx.reply(`👤 **EXPEDIENTE AIFU**\n\nNombre: ${user.nombre}\nRango: ${obtenerRango(user.puntos)}\nEstado: ${user.vip ? '⭐ VIP' : 'Estándar'}`);
});

// --- BOTÓN REPORTAR (Inicia el cuestionario) ---
bot.hears('🛸 Reportar Avistamiento', ctx => {
    sesiones[ctx.from.id] = { paso: 'ubicacion', datos: { fotos: [] } };
    ctx.reply("📍 **PASO 1:** ¿Dónde fue? Envía tu GPS o escribe Ciudad/País.", 
        Markup.keyboard([[Markup.button.locationRequest('📍 Enviar GPS')], ['❌ Cancelar']]).resize());
});

// --- GESTOR DE RESPUESTAS (Aquí pasa toda la magia) ---
bot.on(['text', 'location', 'photo'], async (ctx) => {
    const id = ctx.from.id;
    const s = sesiones[id];
    const texto = ctx.message.text;

    if (texto === '❌ Cancelar') { delete sesiones[id]; return ctx.reply("Cancelado.", menuPrincipal()); }

    // Si el usuario está en medio de un reporte...
    if (s) {
        // Recibir Ubicación (GPS o Texto)
        if (s.paso === 'ubicacion') {
            s.datos.ubicacion = ctx.message.location ? "GPS" : texto;
            s.datos.lat = ctx.message.location?.latitude;
            s.datos.lng = ctx.message.location?.longitude;
            s.paso = 'descripcion';
            return ctx.reply("✅ Recibido. Ahora dime: ¿Qué fenómeno viste?");
        }

        // Recibir Descripción e Interrogar con IA
        if (s.paso === 'descripcion') {
            s.datos.descripcion = texto;
            s.paso = 'preguntas_ia';
            await ctx.sendChatAction('typing');
            const result = await model.generateContent(`Testigo dice: "${texto}". Haz 2 preguntas técnicas cortas.`);
            return ctx.reply(`🔍 **PREGUNTAS TÉCNICAS:**\n\n${result.response.text()}`);
        }

        // Recibir respuestas técnicas y pedir Multimedia
        if (s.paso === 'preguntas_ia') {
            s.datos.detalles_ia = texto;
            s.paso = 'multimedia';
            return ctx.reply("📸 Envía fotos/videos. Al terminar presiona 'Finalizar'.", 
                Markup.keyboard([['🚀 FINALIZAR REPORTE']]).resize());
        }

        // Recibir Fotos
        if (ctx.message.photo && s.paso === 'multimedia') {
            s.datos.fotos.push(ctx.message.photo[ctx.message.photo.length - 1].file_id);
            return ctx.reply("✅ Foto guardada. ¿Alguna otra?");
        }

        // Cerrar Reporte
        if (texto === '🚀 FINALIZAR REPORTE') {
            const user = data.usuarios.find(u => u.id === id);
            user.puntos++;
            data.reportes.push({ id_rep: Date.now(), user: id, ...s.datos });
            guardar();
            delete sesiones[id];
            return ctx.reply("✅ ¡REPORTE ARCHIVADO!", menuPrincipal());
        }
    }

    // Si no está reportando, puede charlar con la IA
    if (sesionesChat[id]) {
        if (texto === 'Terminar charla') { delete sesionesChat[id]; return ctx.reply("Cerrando...", menuPrincipal()); }
        const r = await model.generateContent(texto);
        return ctx.reply(r.response.text());
    }
});

// Lanzamiento
bot.launch();
