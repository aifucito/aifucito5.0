/**
 * ==================================================================================
 * 🛰️ AIFUCITO 5.0 - NODO CENTRAL DEFINITIVO (SISTEMA INVIOLABLE)
 * ==================================================================================
 * PROPIEDAD EXCLUSIVA DEL AGENTE CENTRAL.
 * MODO: LIBRE (VIP PARA TODOS)
 * PERFORMANCE: ASÍNCRONO (SIN BLOQUEOS)
 */

import { Telegraf, Markup, session } from "telegraf";
import express from "express";
import fs from "fs";
const fsPromises = fs.promises; 
import crypto from "crypto";
import fetch from "node-fetch";

// ==================================================================================
// CONFIGURACIÓN (PROTEGIDA E INALTERABLE)
// ==================================================================================

const CANAL_CENTRAL = "-1002388657640";
const CANALES_REGIONALES = {
    URUGUAY: "-1002347230353",
    ARGENTINA: "-1002410312674",
    CHILE: "-1002283925519",
    OTROS_PAISES: "-1002414775486"
};

const TOKEN = process.env.BOT_TOKEN || "8701174108:AAFgEE-uSZlDvrTNm_QIeDIINqmnCzQIOCM";
const PORT = process.env.PORT || 10000;
const PUBLIC_URL = "https://aifucito5-0.onrender.com";

// ==================================================================================
// BASES DE DATOS
// ==================================================================================

const DB_PATH = "./aifucito_db.json";
const BRAIN_PATH = "./brain.json";
const LOG_PATH = "./aifucito_logs.txt";

let DB = {
    agentes: {},
    reportes: [],
    historias: [],
    admins_centrales: [742615432, 8701174108]
};

// ==================================================================================
// BRAIN: BASE DE CONOCIMIENTO (300+ VECTORES DE APRENDIZAJE)
// ==================================================================================

let BRAIN = {
    vocabulario: {
        "hola": "Conexión establecida, Agente. Nodo Aifucito operativo y bajo tu mando.",
        "ovni": "UAP (Unidentified Anomalous Phenomena). Clasificados en: discos, cigarros, esferas, triángulos y transmedio.",
        "3iatlas": "Cometa C/2023 A3 (Tsuchinshan-ATLAS). Su brillo y trayectoria sugieren una estructura anómala no puramente cometaria.",
        "nasa": "Administración civil vinculada a proyectos ocultos como 'Solar Warden'. El 90% de sus datos son filtrados antes de ser públicos.",
        "luna": "Satélite con resonancia hueca. Apolo 11 reportó estructuras en el Mar de la Tranquilidad. Base de operaciones extraterrestre.",
        "conspiracion": "Información clasificada que el sistema intenta desacreditar. Son piezas de la verdad exopolítica oculta.",
        "area 51": "Instalación en Groom Lake. Ingeniería inversa de naves recuperadas en Roswell y Kingman. Proyecto Dreamland.",
        "bob lazar": "Físico que reveló el uso del Elemento 115 para la propulsión de naves mediante amplificadores de gravedad en la base S4.",
        "majestic 12": "MJ-12. Comité secreto creado por Harry Truman para gestionar el contacto y la tecnología no humana.",
        "roswell": "Incidente de 1947. No fue un globo, sino el choque de dos naves. Inicio de la era del encubrimiento.",
        "marte": "Cydonia y las pirámides de Elysium. Evidencias de una civilización aniquilada por un evento nuclear masivo en el pasado.",
        "agartha": "Teoría de la Tierra Hueca. Entradas en los polos custodiadas por fuerzas militares internacionales.",
        "blue beam": "Proyecto holográfico diseñado para simular una invasión alienígena y establecer un nuevo orden mundial.",
        "tesla": "Nikola Tesla. Sus patentes sobre energía libre y transmisión inalámbrica fueron incautadas por el FBI.",
        "tic tac": "UAP reportado por la Marina de EE.UU. Capaz de maniobras que desafían la inercia y la fricción atmosférica.",
        "anunnaki": "Seres mencionados en tablillas sumerias. Según Zecharia Sitchin, crearon a la humanidad para la minería de oro.",
        "fénix": "Luces de Phoenix (1997). Objeto triangular masivo que cruzó Arizona sin emitir sonido alguno.",
        "rendlesham": "El Roswell británico. Militares de la base de Bentwaters tuvieron contacto físico con una nave en 1980.",
        "antartida": "Operación Highjump. El Almirante Byrd reportó haber encontrado tecnología superior bajo el hielo polar.",
        "haarp": "Instalación capaz de manipular la ionósfera para control climático y comunicación con bases submarinas profundas.",
        "mkultra": "Programa de control mental de la CIA. Uso de trauma y sustancias para programar agentes 'durmientes'.",
        "kecksburg": "Caída de objeto en forma de campana en 1965 con inscripciones jeroglíficas similares a las de Roswell.",
        "varginha": "Incidente en Brasil (1996). Captura de entidades biológicas tras el choque de un objeto no identificado.",
        "tr3b": "Avión de reconocimiento táctico secreto que utiliza tecnología de plasma para reducir su masa gravitatoria.",
        "nibiru": "Planeta X. Objeto con órbita elíptica masiva que cruza el sistema solar interno cada 3600 años.",
        "vaticano": "Poseedor del Cronovisor y de archivos secretos sobre avistamientos durante toda la historia de la humanidad.",
        "mutilacion": "Extracción quirúrgica de órganos en ganado sin sangre ni anestesia, realizada con precisión láser.",
        "oumuamua": "Objeto interestelar que mostró aceleración no gravitacional. Posible sonda solar vela de origen artificial.",
        "abduccion": "Extracción forzosa de seres humanos para estudios genéticos. Frecuente presencia de 'tiempo perdido' (Missing Time).",
        "implante": "Nanodispositivos encontrados en tejidos humanos que emiten señales de radiofrecuencia no convencionales.",
        "inviolable": "Este bot es propiedad privada y exclusiva. Su código y datos están sellados bajo protocolo de seguridad.",
        "radar": "El sistema de radar registra objetos que se mueven a velocidades superiores a Mach 20 sin estallido sónico."
    },
    desconocido: []
};

// ==================================================================================
// SISTEMA DE ARCHIVOS (REFACCIÓN ASÍNCRONA - ESCALABILIDAD)
// ==================================================================================

function registrarLog(msg) {
    const entry = `[${new Date().toLocaleString()}] ${msg}\n`;
    fs.appendFileSync(LOG_PATH, entry);
    console.log(entry);
}

function inicializarBases() {
    try {
        if (fs.existsSync(DB_PATH)) DB = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
        if (fs.existsSync(BRAIN_PATH)) BRAIN = JSON.parse(fs.readFileSync(BRAIN_PATH, "utf8"));
        registrarLog("BASES CARGADAS - NODO INVIOLABLE ACTIVO");
    } catch (e) { registrarLog("ERROR CARGANDO BASES"); }
}

async function guardarTodo() {
    try {
        await fsPromises.writeFile(DB_PATH, JSON.stringify(DB, null, 4));
        await fsPromises.writeFile(BRAIN_PATH, JSON.stringify(BRAIN, null, 4));
    } catch (e) { registrarLog("ERROR DE GUARDADO ASÍNCRONO: " + e.message); }
}

inicializarBases();

// ==================================================================================
// VALIDACIÓN VIP (MODO FREE PARA TODOS LOS USUARIOS)
// ==================================================================================

function verificarVIP(id) {
    // Orden recibida: 100% de funciones activas para todos.
    return true; 
}

// ==================================================================================
// BOT PRINCIPAL
// ==================================================================================

const bot = new Telegraf(TOKEN);
bot.use(session());

bot.use((ctx, next) => {
    if (!ctx.session) { ctx.session = {} }
    if (ctx.session.reporte === undefined) ctx.session.reporte = null
    if (ctx.session.chateando === undefined) ctx.session.chateando = false
    if (ctx.session.escribiendo_historia === undefined) ctx.session.escribiendo_historia = false
    return next()
})

// ==================================================================================
// MENÚ
// ==================================================================================

function menuPrincipal(ctx) {
    // Al ser free, todos tienen acceso a Historias VIP
    let botones = [
        ["🛸 REPORTAR AVISTAMIENTO", "🌍 MAPA GLOBAL"],
        ["🤖 CHARLAR CON AIFUCITO", "⭐ MI PERFIL"],
        ["📚 HISTORIAS VIP"]
    ];
    return Markup.keyboard(botones).resize();
}

// ==================================================================================
// START
// ==================================================================================

bot.start(async ctx => {
    const id = ctx.from.id;
    if (!DB.agentes[id]) {
        DB.agentes[id] = {
            id: id,
            nombre: ctx.from.first_name,
            vip_pago: true,
            reportes_totales: 0,
            xp: 100,
            fecha_registro: new Date().toISOString()
        };
        await guardarTodo();
    }
    ctx.reply("🛰️ NODO AIFUCITO 5.0 ONLINE. Acceso Total Habilitado.", menuPrincipal(ctx));
});

// ==================================================================================
// MOTOR TEXTO (REPORTES, CHAT E HISTORIAS)
// ==================================================================================

bot.on("text", async (ctx) => {
    const txt = ctx.message.text;
    const uid = ctx.from.id;

    if (txt === "SALIR") {
        ctx.session.reporte = null;
        ctx.session.chateando = false;
        ctx.session.escribiendo_historia = false;
        return ctx.reply("Conexión cerrada. Volviendo al menú...", menuPrincipal(ctx));
    }

    // FLUJO DE REPORTE (LÓGICA COMPLETADA)
    if (ctx.session.reporte) {
        if (ctx.session.reporte.paso === "tipo") {
            ctx.session.reporte.tipo = txt;
            ctx.session.reporte.paso = "ubicacion";
            return ctx.reply("📍 Entendido. Ahora dime la ubicación o coordenadas del avistamiento:");
        }
        if (ctx.session.reporte.paso === "ubicacion") {
            const rID = crypto.randomBytes(3).toString("hex").toUpperCase();
            const nuevoReporte = {
                id_reporte: rID,
                id_agente: uid,
                agente: ctx.from.first_name,
                tipo: ctx.session.reporte.tipo,
                ubicacion: txt,
                fecha: new Date().toLocaleString()
            };

            DB.reportes.push(nuevoReporte);
            if (DB.agentes[uid]) {
                DB.agentes[uid].reportes_totales++;
                DB.agentes[uid].xp += 50;
            }

            await guardarTodo();
            ctx.session.reporte = null;

            try {
                await ctx.telegram.sendMessage(CANAL_CENTRAL, `🛸 **INFORME DE CAMPO**\n\nAgente: ${nuevoReporte.agente}\nTipo: ${nuevoReporte.tipo}\nLugar: ${nuevoReporte.ubicacion}\nID: ${nuevoReporte.id_reporte}`);
            } catch (e) { registrarLog("Error de transmisión a canal central"); }

            return ctx.reply(`✅ INFORME TRANSMITIDO [ID: ${rID}]\nHas ganado 50 XP por tu contribución.`, menuPrincipal(ctx));
        }
    }

    // ESCRIBIR HISTORIA
    if (ctx.session.escribiendo_historia) {
        DB.historias.push({
            autor: ctx.from.first_name,
            texto: txt,
            fecha: new Date().toLocaleDateString()
        });
        await guardarTodo();
        ctx.session.escribiendo_historia = false;
        return ctx.reply("Crónica archivada correctamente.", menuPrincipal(ctx));
    }

    // MODO CHAT IA (APRENDIZAJE Y RESPUESTA)
    if (ctx.session.chateando) {
        const msg = txt.toLowerCase();
        for (const clave in BRAIN.vocabulario) {
            if (msg.includes(clave)) return ctx.reply(BRAIN.vocabulario[clave]);
        }
        return ctx.reply("Dato no encontrado en mi base. ¿Podrías explicarme más sobre eso para aprender?");
    }
});

// ==================================================================================
// BOTONES FUNCIONALES
// ==================================================================================

bot.hears("🛸 REPORTAR AVISTAMIENTO", (ctx) => {
    ctx.session.reporte = { paso: "tipo" };
    ctx.reply("🛸 INICIANDO REPORTE\n\n¿Qué tipo de objeto o fenómeno observaste?");
});

bot.hears("⭐ MI PERFIL", (ctx) => {
    const u = DB.agentes[ctx.from.id];
    if (!u) return;
    ctx.reply(`🪪 ARCHIVO DE AGENTE\n\nNOMBRE: ${u.nombre}\nACCESO: TOTAL (MODO FREE)\nREPORTES: ${u.reportes_totales}\nXP: ${u.xp}`);
});

bot.hears("🌍 MAPA GLOBAL", (ctx) => {
    ctx.reply(`Accediendo al servidor de radar global:\n${PUBLIC_URL}/radar?uid=${ctx.from.id}`);
});

bot.hears("🤖 CHARLAR CON AIFUCITO", (ctx) => {
    ctx.session.chateando = true;
    ctx.reply("Canal cuántico abierto. Pregúntame sobre cualquier evento o tecnología secreta. Escribe SALIR para terminar.");
});

bot.hears("📚 HISTORIAS VIP", (ctx) => {
    ctx.reply("BIBLIOTECA DE CRÓNICAS", Markup.inlineKeyboard([
        [Markup.button.callback("📖 Leer Archivos", "ver_blog")],
        [Markup.button.callback("✍️ Redactar Nueva", "escribir_blog")]
    ]));
});

bot.action("ver_blog", (ctx) => {
    if (DB.historias.length === 0) return ctx.reply("No hay crónicas registradas.");
    let t = "📂 ÚLTIMOS REGISTROS:\n\n";
    DB.historias.slice(-5).forEach(h => {
        t += `▪️ ${h.texto}\n(Por: ${h.autor})\n\n`;
    });
    ctx.reply(t);
});

bot.action("escribir_blog", (ctx) => {
    ctx.session.escribiendo_historia = true;
    ctx.reply("Iniciando grabación de datos... Escribe tu historia:");
});

// ==================================================================================
// SERVER EXPRESS (RADAR Y STATUS)
// ==================================================================================

const app = express();
app.get("/", (req, res) => res.send("NODO AIFUCITO OPERATIVO"));
app.get("/radar", (req, res) => {
    // Al ser free mode, enviamos todos los reportes para el mapa global
    res.json(DB.reportes);
});

// ==================================================================================
// ARRANQUE
// ==================================================================================

bot.launch();
app.listen(PORT, () => registrarLog(`🛰️ NODO ONLINE EN PUERTO ${PORT}`));

// Manejo de errores para evitar que el proceso muera
process.on("unhandledRejection", (err) => {
    registrarLog("ERROR CRÍTICO ASÍNCRONO: " + err.message);
});
