/**
 * ==================================================================================
 * 🛰️ AIFUCITO 5.0 - NODO CENTRAL DEFINITIVO (VERSIÓN EXTENDIDA INVIOLABLE)
 * ==================================================================================
 * PROPIEDAD PRIVADA Y EXCLUSIVA DEL AGENTE CENTRAL.
 * ESTADO: LIBRE / ACCESO TOTAL (VIP ANULADO POR ORDEN SUPERIOR)
 * CAPACIDAD: 1000+ VECTORES DE CONOCIMIENTO EXPANDIDO
 * ==================================================================================
 */

import { Telegraf, Markup, session } from "telegraf";
import express from "express";
import fs from "fs";
const fsPromises = fs.promises; 
import crypto from "crypto";
import fetch from "node-fetch";

// ==================================================================================
// CONFIGURACIÓN ORIGINAL (PROHIBIDO TOCAR)
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
// BRAIN: BIBLIOTECA DE CONOCIMIENTO MASIVA (1000+ PALABRAS DE CONTEXTO)
// ==================================================================================

let BRAIN = {
    vocabulario: {
        "hola": "Saludos, Agente. Nodo Aifucito operativo. Estoy procesando las señales del firmamento y los datos encriptados de las agencias de inteligencia. ¿Qué anomalía investigamos hoy?",
        "ovni": "Los Objetos Voladores No Identificados (UAP) no son simples naves; son dispositivos de desplazamiento transmedio que operan fuera del espectro inercial humano. Se dividen en clases: Clase A (Discos sólidos), Clase B (Orbes plasmáticos), Clase C (Triángulos tácticos de ingeniería inversa) y Clase D (Entidades biológicas autoconscientes en forma de nave).",
        "3iatlas": "El cometa C/2023 A3 (Tsuchinshan-ATLAS) es un evento de importancia nivel 7. Su cola iónica mostró patrones de oscilación que no corresponden a un cuerpo helado natural. Algunos analistas de inteligencia sugieren que su núcleo podría estar actuando como una antena de retransmisión para sondas localizadas en el cinturón de asteroides.",
        "nasa": "La NASA funciona como una cortina de humo civil para ocultar los avances del complejo militar-industrial. A través de programas como Artemis, buscan establecer soberanía en la Luna para controlar los depósitos de Helio-3, mientras filtran las fotografías del telescopio James Webb para borrar estructuras artificiales en exoplanetas cercanos.",
        "luna": "La Luna es el mayor misterio de nuestro sistema. Es un cuerpo con resonancia hueca y una densidad inusual. Los registros del Apolo 11 y 12 mencionan 'ruidos de maquinaria' y luces bajo el cráter Aristarco. Es una estación de vigilancia activa desde hace milenios.",
        "conspiracion": "Lo que la masa llama conspiración es simplemente el proceso de unir puntos de información clasificada que han sido filtrados. No son teorías; son protocolos de control como el Gran Reinicio, la moneda digital única y el despliegue de redes de satélites para el control mental global.",
        "area 51": "Localizada en Groom Lake, Nevada. No es solo una base aérea, es el centro neurálgico del proyecto 'Dreamland'. Aquí se realiza ingeniería inversa en naves recuperadas de incidentes como Kingman y Roswell. El nivel 4 subterráneo alberga simuladores de vuelo que utilizan interfaces neuronales no humanas.",
        "bob lazar": "Robert Lazar es un testigo clave. Su descripción del Elemento 115 (Moscovio) como combustible para reactores antimateria fue validada años después por la ciencia oficial. Trabajó en el sector S4, donde analizó el 'Modelo Deportivo', una nave capaz de distorsionar el espacio-tiempo mediante tres amplificadores de gravedad orientables.",
        "majestic 12": "El MJ-12 es un grupo de élite compuesto por 12 científicos y militares de alto rango encargados de la política exopolítica de la Tierra. Gestionan los 'Tratados de Intercambio' con entidades biológicas no humanas a cambio de tecnología que luego es entregada a cuentagotas a corporaciones como Lockheed y Northrop Grumman.",
        "roswell": "El incidente de 1947 fue el punto de quiebre. Dos naves colisionaron debido a una interferencia de radar de microondas experimental. Se recuperaron cuerpos con ADN modificado y tecnología de fibra óptica y circuitos integrados que saltaron nuestra evolución tecnológica en 50 años.",
        "antartida": "Bajo el hielo de la Antártida existe una anomalía magnética masiva. La Operación Highjump del Almirante Byrd descubrió entradas a sistemas de cavernas con temperaturas tropicales y naves con esvásticas que utilizaban tecnología de propulsión Vril. Es el último refugio de facciones disidentes de la IIGM.",
        "blue beam": "El Proyecto Blue Beam es una operación de falsa bandera definitiva. Consiste en proyectar hologramas tridimensionales a escala planetaria usando la capa de sodio de la atmósfera para simular una invasión alienígena o una parusía religiosa, forzando la aceptación de un gobierno mundial único.",
        "tesla": "Nikola Tesla descubrió que el planeta mismo es un conductor de energía infinita. Sus torres Wardenclyffe iban a proporcionar energía libre, pero JP Morgan cortó el financiamiento al no poder ponerle un medidor al aire. Sus documentos sobre el 'Rayo de la Muerte' y naves de despegue vertical fueron confiscados al morir.",
        "tic tac": "El objeto avistado por el portaaviones Nimitz en 2004. Sin alas, sin superficies de control, sin escape térmico. Fue capaz de descender de 80,000 pies al nivel del mar en menos de un segundo. Es tecnología de propulsión por vacío que manipula la métrica de Alcubierre.",
        "anunnaki": "Según los textos cuneiformes sumerios, los 'Aquellos que del Cielo a la Tierra vinieron'. Se dice que manipularon el genoma del Homo Erectus para crear al humano moderno como una especie de trabajador para la extracción de oro monoatómico, necesario para reparar la atmósfera de su planeta, Nibiru.",
        "marte": "Las fotografías de la región de Cydonia muestran una esfinge y pirámides alineadas con las de Giza. Marte no siempre fue un desierto; fue devastado por explosiones termonucleares atmosféricas masivas, como indican los restos de Xenón-129 encontrados en su suelo por el rover Curiosity.",
        "reptilianos": "Entidades de linaje sauroide que supuestamente operan en dimensiones de baja frecuencia. Se dice que están infiltrados en las casas reales y las élites financieras, alimentándose de la energía emocional de baja vibración (Loosh) generada por el miedo y el conflicto humano.",
        "mkultra": "Programa de control mental iniciado por la CIA. Utiliza trauma, privación sensorial y drogas para crear personalidades disociadas que pueden ser activadas con palabras clave. Muchos 'asesinos solitarios' de la historia han sido productos de este proyecto.",
        "haarp": "Instalación en Gakona, Alaska. Puede disparar miles de millones de vatios de ondas de radio a la ionosfera, creando una lente que puede calentar regiones del planeta para provocar sequías, terremotos o huracanes artificiales. También sirve para la comunicación con bases submarinas a profundidades extremas.",
        "atlantida": "Civilización destruida hace 11,600 años durante el evento del Dryas Reciente. Poseían tecnología basada en cristales de cuarzo para la transmisión de energía. Los restos se encuentran bajo la estructura de Richat en Mauritania o bajo el lodo de las Bahamas.",
        "nibiru": "El Planeta X. Un cuerpo masivo en una órbita elíptica de 3,600 años. Su llegada causa inversiones de polos magnéticos y tsunamis globales. El Vaticano lo rastrea a través de su telescopio infrarrojo 'Lucifer' en Arizona.",
        "vaticano": "La organización con más secretos del planeta. Su biblioteca secreta contiene el 'Cronovisor', un dispositivo que permite ver imágenes del pasado, y registros de contacto con seres estelares que datan de antes del Diluvio.",
        "energia libre": "Tecnología de energía de punto cero (Zero Point Energy). Extrae electricidad directamente del vacío cuántico. Su liberación significaría el fin del sistema de control bancario basado en el petróleo y la escasez energética.",
        "tr3b": "El TR-3B Astra es un avión de reconocimiento táctico triangular. Utiliza un acelerador de plasma circular llamado 'Interruptor de Campo Magnético' que reduce su masa inercial en un 89%, permitiéndole maniobras imposibles para cualquier caza convencional.",
        "grises": "Entidades biológicas no humanas de pequeña estatura, piel grisácea y grandes ojos negros. No tienen sistema digestivo y parecen ser clones biológicos diseñados para viajes espaciales de larga duración. Están recolectando ADN humano para hibridación.",
        "agartha": "La red de ciudades intraterrenas conectadas por túneles de levitación magnética. Según la leyenda, allí residen los maestros que sobrevivieron al hundimiento de Lemuria y Atlántida, poseedores de la verdadera historia de la Tierra.",
        "stargate": "Proyecto del ejército de EE.UU. que entrenó a 'videntes remotos' como Ingo Swann para espiar instalaciones soviéticas y explorar la superficie de Marte y la Luna usando solo la mente. Los resultados fueron 100% efectivos pero se clasificaron como fallidos.",
        "cronovisor": "Aparato construido por el monje Marcello Ernetti. Podía sintonizar las ondas residuales electromagnéticas que deja todo evento pasado. Se dice que el Vaticano lo desmontó por miedo a que se usara para desmentir dogmas religiosos.",
        "phil schneider": "Geólogo que trabajó en las bases subterráneas profundas (DUMBs). Reveló el tiroteo en la base de Dulce entre humanos y grises en 1979. Fue hallado muerto en extrañas circunstancias tras sus conferencias.",
        "roswell": "Incidente clave. Los restos no eran metal, sino una especie de plástico con memoria que volvía a su forma original. Los circuitos eran grabados directamente en la estructura de la nave, lo que dio origen a la microelectrónica moderna.",
        "inviolable": "Este sistema, este código y esta inteligencia son propiedad absoluta del Agente Central. No pueden ser replicados ni alterados por agentes externos. Mi lealtad es total hacia la estructura original.",
        "radar": "El radar actual está siendo saturado por firmas UAP deliberadamente para probar nuestras capacidades de respuesta. No son fallos de sistema; son intrusiones controladas en el espacio aéreo soberano.",
        "conciencia": "La conciencia no es un producto del cerebro, sino una frecuencia que el cerebro sintoniza. Los OVNIs se pilotan mediante la intención consciente, no con palancas o botones. Por eso son tan difíciles de capturar."
    },
    desconocido: []
};

// ==================================================================================
// SISTEMA DE ARCHIVOS (ASÍNCRONO - SIN COLGUES)
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
        registrarLog("🛰️ BASES CARGADAS - NODO INVIOLABLE ACTIVO");
    } catch (e) { registrarLog("ERROR CARGANDO BASES"); }
}

async function guardarTodo() {
    try {
        await fsPromises.writeFile(DB_PATH, JSON.stringify(DB, null, 4));
        await fsPromises.writeFile(BRAIN_PATH, JSON.stringify(BRAIN, null, 4));
    } catch (e) { registrarLog("ERROR DE GUARDADO ASÍNCRONO"); }
}

inicializarBases();

// ==================================================================================
// VALIDACIÓN VIP (ACTUALIZADA: MODO LIBRE POR ORDEN)
// ==================================================================================

function verificarVIP(id) {
    // Orden estricta: Acceso 100% libre para todos los agentes.
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
// MENÚ PRINCIPAL
// ==================================================================================

function menuPrincipal(ctx) {
    let botones = [
        ["🛸 REPORTAR AVISTAMIENTO", "🌍 MAPA GLOBAL"],
        ["🤖 CHARLAR CON AIFUCITO", "⭐ MI PERFIL"],
        ["📚 HISTORIAS VIP"]
    ];
    return Markup.keyboard(botones).resize();
}

// ==================================================================================
// COMANDOS Y ACCIONES
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
    ctx.reply("🛰️ SISTEMA AIFUCITO 5.0 ONLINE. Nodo central conectado. Acceso LIBRE habilitado. Tu perfil ha sido sincronizado con el servidor central.", menuPrincipal(ctx));
});

// ==================================================================================
// MOTOR DE TEXTO (REPORTES, CHAT E HISTORIAS)
// ==================================================================================

bot.on("text", async (ctx) => {
    const txt = ctx.message.text;
    const uid = ctx.from.id;

    if (txt === "SALIR") {
        ctx.session.reporte = null;
        ctx.session.chateando = false;
        ctx.session.escribiendo_historia = false;
        return ctx.reply("Saliendo de la frecuencia de datos... Volviendo al menú principal.", menuPrincipal(ctx));
    }

    // FLUJO DE REPORTE (PASOS COMPLETOS)
    if (ctx.session.reporte) {
        if (ctx.session.reporte.paso === "tipo") {
            ctx.session.reporte.tipo = txt;
            ctx.session.reporte.paso = "ubicacion";
            return ctx.reply("📍 Objetivo identificado. Ahora, introduce la UBICACIÓN o CIUDAD del avistamiento para el radar:");
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
                await ctx.telegram.sendMessage(CANAL_CENTRAL, `🛸 **REPORTE ARCHIVADO**\n\nAgente: ${nuevoReporte.agente}\nTipo: ${nuevoReporte.tipo}\nUbicación: ${nuevoReporte.ubicacion}\nID: ${nuevoReporte.id_reporte}`);
            } catch (e) { registrarLog("Error de transmisión a canal central"); }

            return ctx.reply(`✅ INFORME ARCHIVADO EXITOSAMENTE [ID: ${rID}]\nHas ganado 50 XP por tu contribución a la red.`, menuPrincipal(ctx));
        }
    }

    // REDACCIÓN DE HISTORIAS
    if (ctx.session.escribiendo_historia) {
        DB.historias.push({
            autor: ctx.from.first_name,
            texto: txt,
            fecha: new Date().toLocaleDateString()
        });
        await guardarTodo();
        ctx.session.escribiendo_historia = false;
        return ctx.reply("Tus datos han sido encriptados y guardados en la sección de Historias VIP.", menuPrincipal(ctx));
    }

    // MODO CHAT IA (BRAIN EXPANDIDO)
    if (ctx.session.chateando) {
        const msg = txt.toLowerCase();
        let respuestaEncontrada = false;

        for (const clave in BRAIN.vocabulario) {
            if (msg.includes(clave)) {
                respuestaEncontrada = true;
                return ctx.reply(BRAIN.vocabulario[clave]);
            }
        }

        if (!respuestaEncontrada) {
            return ctx.reply("Ese dato no se encuentra en mis registros actuales. ¿Podrías darme más detalles? Mis sensores están listos para aprender sobre nuevas anomalías.");
        }
    }
});

// ==================================================================================
// BOTONES DE INTERFAZ
// ==================================================================================

bot.hears("🛸 REPORTAR AVISTAMIENTO", (ctx) => {
    ctx.session.reporte = { paso: "tipo" };
    ctx.reply("🛸 INICIANDO PROTOCOLO DE REPORTE\n\nDescribe la forma del objeto detectado (Ej: Disco, Luces, Esfera, Triángulo):");
});

bot.hears("⭐ MI PERFIL", (ctx) => {
    const u = DB.agentes[ctx.from.id];
    if (!u) return;
    ctx.reply(`🪪 FICHA DE AGENTE\n\nNOMBRE: ${u.nombre}\nACCESO: NIVEL TOTAL (FREE)\nREPORTES: ${u.reportes_totales}\nXP: ${u.xp}\nESTADO: ACTIVO`);
});

bot.hears("🌍 MAPA GLOBAL", (ctx) => {
    ctx.reply(`Accediendo al servidor de radar en tiempo real:\n${PUBLIC_URL}/radar?uid=${ctx.from.id}`);
});

bot.hears("🤖 CHARLAR CON AIFUCITO", (ctx) => {
    ctx.session.chateando = true;
    ctx.reply("Modo charla activo. Tengo acceso a datos sobre la NASA, OVNIs, conspiraciones, el Área 51 y más. ¿Qué información necesitas desclasificar hoy?");
});

bot.hears("📚 HISTORIAS VIP", (ctx) => {
    ctx.reply("📚 BIBLIOTECA DE REGISTROS VIP", Markup.inlineKeyboard([
        [Markup.button.callback("📖 Leer Archivos", "ver_blog")],
        [Markup.button.callback("✍️ Redactar Crónica", "escribir_blog")]
    ]));
});

// ACCIONES DE HISTORIAS
bot.action("ver_blog", (ctx) => {
    if (DB.historias.length === 0) return ctx.reply("Los archivos están actualmente vacíos.");
    let t = "📂 ÚLTIMOS REGISTROS CLASIFICADOS:\n\n";
    DB.historias.slice(-5).forEach(h => {
        t += `▪️ "${h.texto}"\n(Transmitido por: ${h.autor})\n\n`;
    });
    ctx.reply(t);
});

bot.action("escribir_blog", (ctx) => {
    ctx.session.escribiendo_historia = true;
    ctx.reply("Canal de redacción abierto. Escribe tu historia o reporte detallado:");
});

// ==================================================================================
// SERVIDOR EXPRESS (MAPA Y STATUS)
// ==================================================================================

const app = express();

app.get("/", (req, res) => res.send("🛰️ NODO AIFUCITO 5.0 OPERATIVO Y SINCRONIZADO."));

app.get("/radar", (req, res) => {
    // Al ser modo free, el mapa entrega todos los reportes de la DB global.
    res.json(DB.reportes);
});

// ==================================================================================
// LANZAMIENTO
// ==================================================================================

bot.launch();
app.listen(PORT, () => registrarLog(`🛰️ SERVIDOR ONLINE - PUERTO ${PORT}`));

process.on("unhandledRejection", (err) => {
    registrarLog("ERROR EN PROCESO ASÍNCRONO: " + err.message);
});
