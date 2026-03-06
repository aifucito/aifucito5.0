/**
 * ==================================================================================
 * 🛰️ AIFUCITO OMEGA CORE v17.0 - "EL REVELADOR"
 * NODO CENTRAL: Aifu Radar Cono Sur (-1002388657640)
 * ==================================================================================
 * [PROTOCOLO DE OPERACIÓN SUPREMO - PROHIBIDO COMPRIMIR]
 * * PERSONALIDAD DE AIFUCITO:
 * - Alegre y Efusivo: "¡Qué hacés, Agente! ¡Tremendo lo que me contás!"
 * - Jovial y Humano: Usa términos como "che", "amigo", "camarada".
 * - Conspiranoico: "Ellos no quieren que veas esto, pero nosotros sí."
 * - Metódico: Clasificación estricta de datos y coordenadas.
 * * LÓGICA DE ACCESO (EL GRAN CORTE):
 * - HASTA VIERNES 13, 23:59:59: Acceso VIP Total (Prueba de Campo).
 * - DESDE SÁBADO 14, 00:00:00: Solo VIP Pagos y Admins mantienen privilegios.
 * - NO VIP: Mapa restringido (solo lo suyo) y Multimedia ajena con BORROSIDAD.
 * ==================================================================================
 */

import { Telegraf, Markup, session } from "telegraf";
import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import fetch from "node-fetch";

// --- CONFIGURACIÓN DE RED (ESTIPULADA) ---
const CANAL_CENTRAL = "-1002388657640"; // Aifu Radar Cono Sur
const CANALES_REGIONALES = {
    URUGUAY: "-1002347230353",
    ARGENTINA: "-1002410312674",
    CHILE: "-1002283925519"
};

const TOKEN = "8701174108:AAFgEE-uSZlDvrTNm_QIeDIINqmnCzQIOCM";
const PORT = process.env.PORT || 10000;
const PUBLIC_URL = "https://aifucito.onrender.com";

// --- FECHAS DE CONTROL CRONOLÓGICO ---
const FECHA_CORTE_VIP = new Date("2026-03-14T00:00:00").getTime();

// --- PERSISTENCIA DE DATOS (NIVEL INVESTIGACIÓN) ---
const DB_PATH = "./aifucito_db.json";
const BRAIN_PATH = "./brain.json";
const LOG_PATH = "./aifucito_logs.txt";

let DB = { 
    agentes: {}, 
    reportes: [], 
    historias: [], 
    admins_centrales: [742615432, 8701174108] // IDs con poder total
};

let BRAIN = { 
    vocabulario: { 
        "hola": "¡Hola, hola, Agente! ¡Qué alegría verte por el radar! ¿Viste algo raro hoy?",
        "ovni": "¡Las naves de ellos! O de nosotros... ¿quién sabe? Pero que están, están.",
        "aifucito": "¡Ese soy yo! Tu compañero de conspiraciones y el mejor buscador de luces del Cono Sur.",
        "cono sur": "Nuestra tierra, nuestra base. ¡Uruguay, Argentina y Chile unidos por la verdad!",
        "vip": "El estatus de Élite. Si lo tenés, ves la verdad sin censura.",
        "borroso": "Si ves algo borroso es porque no sos VIP... ¡Ellos te están tapando los ojos, che!",
        "verdad": "La verdad es esquiva, pero con este bot la vamos a acorralar.",
        "miedo": "¡Acá no hay miedo! Acá hay curiosidad y método científico, Agente."
    }, 
    desconocido: [] 
};

// --- FUNCIONES DE CARGA Y GUARDADO ---
function inicializarBases() {
    try {
        if (fs.existsSync(DB_PATH)) DB = JSON.parse(fs.readFileSync(DB_PATH));
        if (fs.existsSync(BRAIN_PATH)) BRAIN = JSON.parse(fs.readFileSync(BRAIN_PATH));
        registrarLog("SISTEMA: Bases de datos cargadas con éxito.");
    } catch (e) {
        registrarLog("ERROR: Fallo en carga de bases. Iniciando modo recuperación.");
    }
}

const guardarTodo = () => {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(DB, null, 4));
        fs.writeFileSync(BRAIN_PATH, JSON.stringify(BRAIN, null, 4));
    } catch (e) {
        registrarLog("ERROR: No se pudo guardar la información en disco.");
    }
};

const registrarLog = (msg) => {
    const entry = `[${new Date().toLocaleString()}] ${msg}\n`;
    fs.appendFileSync(LOG_PATH, entry);
    console.log(entry);
};

// --- MOTOR DE VALIDACIÓN DE JERARQUÍA ---
const verificarEstatusVIP = (id) => {
    const ahora = Date.now();
    
    // 1. Los Administradores son VIP de por vida
    if (DB.admins_centrales.includes(id)) return true;
    
    // 2. Si el agente pagó y fue activado manualmente
    if (DB.agentes[id]?.vip_pago === true) return true;

    // 3. LA REGLA DEL VIERNES 13: Hasta esa fecha, todos prueban el VIP
    if (ahora < FECHA_CORTE_VIP) return true;

    // 4. Fuera de fecha y sin pago = Usuario Estándar
    return false;
};

// --- MOTOR DE CONCIENCIA AIFUCITO (APRENDIZAJE HUMANO) ---
function procesarConciencia(ctx, texto) {
    const t = texto.toLowerCase().trim();
    const id = ctx.from.id;

    // AIFUCITO en modo alumno (Esperando definición)
    if (ctx.session.aprendiendo_de_vos) {
        const palabraOriginal = ctx.session.aprendiendo_de_vos;
        BRAIN.vocabulario[palabraOriginal] = texto;
        delete ctx.session.aprendiendo_de_vos;
        guardarTodo();
        return `✨ ¡ESPECTACULAR! ✨ Ya guardé en mi memoria que **"${palabraOriginal}"** significa: _${texto}_. ¡Gracias por enseñarme, Agente! Sos un genio.`;
    }

    // Buscar en la biblioteca de AIFUCITO
    for (const [clave, respuesta] of Object.entries(BRAIN.vocabulario)) {
        if (t.includes(clave)) return respuesta;
    }

    // AIFUCITO no entiende y pide ayuda (Personalidad Humana)
    ctx.session.aprendiendo_de_vos = t;
    if (!BRAIN.desconocido.includes(t)) {
        BRAIN.desconocido.push(t);
        guardarTodo();
    }
    return `🤔 ¡EPA! Me mataste, che... **"${t}"** no lo tengo en mis archivos secretos. ¿Me explicás qué significa? Así me vuelvo más inteligente para la próxima.`;
}

// --- CONFIGURACIÓN DEL BOT ---
const bot = new Telegraf(TOKEN);
bot.use(session());

const menuDinamico = (ctx) => {
    const id = ctx.from.id;
    const esVip = verificarEstatusVIP(id);
    
    let botones = [
        ["🛸 REPORTAR AVISTAMIENTO", "🌍 RADAR GLOBAL"],
        ["🤖 CHARLAR CON AIFUCITO", "⭐ MI PERFIL"]
    ];
    
    // Solo mostramos herramientas VIP si tiene el estatus
    if (esVip) {
        botones.push(["📚 HISTORIAS VIP", "🕵️ MODO ANÓNIMO"]);
    }
    
    return Markup.keyboard(botones).resize();
};

// --- INTERACCIONES INICIALES ---
bot.start((ctx) => {
    const id = ctx.from.id;
    if (!DB.agentes[id]) {
        DB.agentes[id] = {
            id,
            nombre: ctx.from.first_name,
            vip_pago: false,
            anonimo: false,
            reportes_totales: 0,
            xp: 0
        };
        guardarTodo();
    }
    
    registrarLog(`CONEXIÓN: Agente ${ctx.from.first_name} ha entrado al sistema.`);
    
    ctx.reply(`🛸 ¡BIENVENIDO AL NODO CENTRAL, CAMARADA! 🛸\n\nSoy **AIFUCITO**, tu oficial de enlace en el **Aifu Radar Cono Sur**.\n\n⚠️ **ATENCIÓN:** Estamos en fase de prueba abierta. Tenés acceso VIP TOTAL hasta el Viernes 13 a las 23:59:59. ¡Aprovechá para desclasificar todo!`, menuDinamico(ctx));
});

// --- MÓDULO DE HISTORIAS (BLOG EXCLUSIVO) ---
bot.hears("📚 HISTORIAS VIP", (ctx) => {
    if (!verificarEstatusVIP(ctx.from.id)) {
        return ctx.reply("❌ **ACCESO DENEGADO**\n\nTu periodo de prueba terminó. Necesitás el Rango VIP Pago para leer y escribir en el Blog de Historias. ¡No dejes que te oculten la verdad!");
    }
    
    ctx.reply("📖 **PORTAL DE HISTORIAS PROHIBIDAS**\n¿Qué desea hacer, Agente de Élite?", 
        Markup.inlineKeyboard([
            [Markup.button.callback("📖 Leer el Blog", "ver_blog")],
            [Markup.button.callback("✍️ Publicar Historia", "escribir_blog")]
        ]));
});

bot.action("ver_blog", (ctx) => {
    if (DB.historias.length === 0) return ctx.answerCbQuery("El blog está vacío por ahora...");
    
    let salida = "📝 **ULTIMAS ENTRADAS DESCLASIFICADAS:**\n\n";
    DB.historias.slice(-8).reverse().forEach(h => {
        salida += `👤 **Agente:** ${h.autor}\n📜 ${h.texto}\n📅 ${h.fecha}\n\n━━━━━━━━━━━━━━\n`;
    });
    ctx.replyWithMarkdown(salida);
});

bot.action("escribir_blog", (ctx) => {
    ctx.session.paso_blog = "escribiendo";
    ctx.reply("✍️ **MODO REDACCIÓN ACTIVO**\n\nEscribí tu historia a continuación. Será compartida con todos los Agentes VIP.");
});

// --- MODO ANÓNIMO (SIGILO) ---
bot.hears("🕵️ MODO ANÓNIMO", (ctx) => {
    if (!verificarEstatusVIP(ctx.from.id)) return ctx.reply("❌ Función bloqueada para usuarios estándar.");
    
    DB.agentes[ctx.from.id].anonimo = !DB.agentes[ctx.from.id].anonimo;
    guardarTodo();
    
    const msg = DB.agentes[ctx.from.id].anonimo 
        ? "✅ **SIGILO ACTIVADO:** Ahora sos un Agente Fantasma." 
        : "👁️ **SIGILO DESACTIVADO:** Tu nombre volverá a aparecer en los reportes.";
    ctx.reply(msg);
});

// --- SISTEMA DE REPORTES (EL CORAZÓN DEL BOT) ---
bot.hears("🛸 REPORTAR AVISTAMIENTO", (ctx) => {
    ctx.session.reporte = { paso: "tipo", inicio: Date.now() };
    ctx.reply("🛸 ¡Excelente iniciativa! Vamos a registrar esto para la posteridad.\n\n¿Qué tipo de fenómeno tuviste enfrente?", 
        Markup.keyboard([["🛸 OVNI / Nave", "✨ Luz Anómala"], ["👽 Entidad / Ser", "🌀 Otros"], ["❌ ABORTAR MISIÓN"]]).resize());
});

bot.on("text", async (ctx) => {
    const txt = ctx.message.text;
    const id = ctx.from.id;

    if (txt === "❌ ABORTAR MISIÓN" || txt.toLowerCase() === "salir") {
        ctx.session.reporte = null;
        ctx.session.chat_activo = false;
        ctx.session.paso_blog = null;
        return ctx.reply("¡Misión abortada! Volvemos a base.", menuDinamico(ctx));
    }

    // Procesar Blog VIP
    if (ctx.session?.paso_blog === "escribiendo") {
        const user = DB.agentes[id];
        DB.historias.push({
            autor: user.anonimo ? "Agente Fantasma 🕵️" : ctx.from.first_name,
            texto: txt,
            fecha: new Date().toLocaleString()
        });
        guardarTodo();
        ctx.session.paso_blog = null;
        return ctx.reply("✅ **HISTORIA ARCHIVADA:** Ya está disponible en el Blog VIP.", menuDinamico(ctx));
    }

    // Procesar Charla con AIFUCITO
    if (ctx.session?.chat_activo || ctx.session?.aprendiendo_de_vos) {
        return ctx.reply(procesarConciencia(ctx, txt));
    }

    // LÓGICA DE REPORTE POR PASOS
    if (!ctx.session?.reporte) return;
    const rep = ctx.session.reporte;

    if (rep.paso === "tipo") {
        rep.tipo = txt;
        rep.paso = "ubicacion";
        ctx.reply("📍 **GEOLOCALIZACIÓN**\n¿Dónde ocurrió el evento? Podés enviar tu ubicación GPS o escribirla manualmente.", 
            Markup.keyboard([[Markup.button.locationRequest("📍 Enviar mi GPS")], ["✍️ Escribir Manualmente"], ["❌ ABORTAR MISIÓN"]]).resize());
    } 
    else if (rep.paso === "manual_input") {
        ctx.reply("🔍 **RASTREANDO COORDENADAS...**");
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(txt)}&limit=1`);
            const data = await res.json();
            if (data[0]) {
                rep.lat = parseFloat(data[0].lat);
                rep.lng = parseFloat(data[0].lon);
                rep.lugar = txt;
                rep.paso = "descripcion";
                ctx.reply(`✅ **ZONA IDENTIFICADA:** ${data[0].display_name}\n\nAhora, camarada, describí con todo detalle lo que viste:`);
            } else {
                ctx.reply("⚠️ No encuentro ese lugar en mis mapas terrestres. Probá con: Ciudad, País.");
            }
        } catch (e) { ctx.reply("Error en el radar de mapas. Intentá de nuevo."); }
    }
    else if (rep.paso === "descripcion") {
        rep.descripcion = txt;
        rep.paso = "multimedia";
        ctx.reply("📸 **EVIDENCIA FOTOGRÁFICA**\nMándame una foto o video. Si no tenés, escribí **FIN** para cerrar el reporte.");
    }
    else if (txt.toUpperCase() === "FIN" && rep.paso === "multimedia") {
        finalizarDifusion(ctx);
    }
});

bot.hears("✍️ Escribir Manualmente", (ctx) => {
    if (ctx.session?.reporte) {
        ctx.session.reporte.paso = "manual_input";
        ctx.reply("Escribí el lugar lo más preciso posible:");
    }
});

bot.on("location", (ctx) => {
    if (ctx.session?.reporte?.paso === "ubicacion") {
        const r = ctx.session.reporte;
        r.lat = ctx.message.location.latitude;
        r.lng = ctx.message.location.longitude;
        r.lugar = "Coordenadas GPS Directas";
        r.paso = "descripcion";
        ctx.reply("📍 GPS Captado con éxito. ¡Ahora contame qué pasó!");
    }
});

bot.on(["photo", "video"], async (ctx) => {
    if (ctx.session?.reporte?.paso === "multimedia") {
        ctx.session.reporte.media = ctx.message.photo ? ctx.message.photo.pop().file_id : ctx.message.video.file_id;
        ctx.session.reporte.mediaType = ctx.message.photo ? "photo" : "video";
        ctx.reply("💾 **PROCESANDO EVIDENCIA...**");
        finalizarDifusion(ctx);
    }
});

// --- DIFUSIÓN Y SEGMENTACIÓN (AIFU RADAR CONO SUR) ---
async function finalizarDifusion(ctx) {
    const r = ctx.session.reporte;
    const user = DB.agentes[ctx.from.id];
    const nombreFinal = user.anonimo ? "Agente Fantasma 🕵️" : user.nombre;

    const nuevoReporte = {
        id: crypto.randomBytes(3).toString("hex"),
        id_agente: ctx.from.id, // ID para el filtro de mapa
        agente: nombreFinal,
        tipo: r.tipo,
        desc: r.descripcion,
        lat: r.lat, 
        lng: r.lng, 
        lugar: r.lugar,
        media: r.media || null,
        mType: r.mediaType || null,
        fecha: new Date().toLocaleString()
    };

    DB.reportes.push(nuevoReporte);
    user.xp += 2000;
    user.reportes_totales++;
    guardarTodo();

    const alerta = `🚨 **NUEVA ALERTA: AIFU RADAR CONO SUR** 🚨\n━━━━━━━━━━━━━━\n🕵️ **Agente:** ${nombreFinal}\n🛸 **Tipo:** ${r.tipo}\n📍 **Sector:** ${r.lugar}\n📝 **Detalle:** ${r.descripcion}\n━━━━━━━━━━━━━━\n📡 _Suministrado por AIFUCITO v17.0_`;

    // 1. Envío al Canal Central (Aifu Radar Cono Sur)
    try {
        if (r.media) {
            if (r.mediaType === "photo") await bot.telegram.sendPhoto(CANAL_CENTRAL, r.media, { caption: alerta, parse_mode: "Markdown" });
            else await bot.telegram.sendVideo(CANAL_CENTRAL, r.media, { caption: alerta, parse_mode: "Markdown" });
        } else await bot.telegram.sendMessage(CANAL_CENTRAL, alerta, { parse_mode: "Markdown" });
    } catch (e) { registrarLog("ERROR: Fallo en difusión Canal Central."); }

    // 2. Envío a Canal Regional (Lógica de Segmentación)
    const regionalID = identificarRegion(r.lugar);
    if (regionalID) {
        try {
            await bot.telegram.sendMessage(regionalID, `📢 **REPORTE REGIONAL:**\n\n${alerta}`, { parse_mode: "Markdown" });
        } catch (e) {}
    }

    ctx.session.reporte = null;
    ctx.reply("✅ **REPORTE DESCLASIFICADO CON ÉXITO**\n\nTu información ya está en el Canal Central. ¡Buen trabajo, Agente!", menuDinamico(ctx));
}

function identificarRegion(lugar) {
    const l = lugar.toLowerCase();
    if (l.includes("uruguay")) return CANALES_REGIONALES.URUGUAY;
    if (l.includes("argentina")) return CANALES_REGIONALES.ARGENTINA;
    if (l.includes("chile")) return CANALES_REGIONALES.CHILE;
    return null;
}

// --- MÓDULO DE CHARLA ---
bot.hears("🤖 CHARLAR CON AIFUCITO", (ctx) => {
    ctx.session.chat_activo = true;
    ctx.reply("¡ACÁ ESTOY, CHE! 🤖\n\nHablame de lo que quieras: teorías, avistamientos o simplemente saludame. Si hay algo que no sé, me lo enseñás vos. (Escribí **SALIR** para volver al menú)");
});

// --- PERFIL DE AGENTE ---
bot.hears("⭐ MI PERFIL", (ctx) => {
    const u = DB.agentes[ctx.from.id];
    const vip = verificarEstatusVIP(ctx.from.id) ? "💎 AGENTE ÉLITE (VIP)" : "👤 CIVIL (ESTÁNDAR)";
    
    ctx.replyWithMarkdown(`🕵️ **EXPEDIENTE DE INTELIGENCIA**\n━━━━━━━━━━━━━━\n👤 **Nombre:** ${u.nombre}\n🎫 **Estatus:** ${vip}\n📡 **Reportes:** ${u.reportes_totales}\n⭐ **Puntos XP:** ${u.xp}\n━━━━━━━━━━━━━━\n_Aifu Radar Cono Sur_`);
});

// --- RADAR GLOBAL (WEB CON RESTRICCIONES) ---
bot.hears("🌍 RADAR GLOBAL", (ctx) => {
    const token = crypto.randomBytes(8).toString("hex");
    const uid = ctx.from.id;
    ctx.reply(`🛰️ **SISTEMA DE MONITOREO EN VIVO**\n\nAccediendo a la red de satélites...\n\n🔗 [CLIC AQUÍ PARA ABRIR EL RADAR](${PUBLIC_URL}/radar?token=${token}&uid=${uid})\n\n_⚠️ Recordá: Si no sos VIP, solo verás tus reportes y la multimedia ajena estará censurada._`, { parse_mode: "Markdown" });
});

// --- SERVIDOR WEB (LÓGICA DE BORROSIDAD Y FILTRO) ---
const app = express();
app.get("/radar", (req, res) => {
    const uid = parseInt(req.query.uid);
    const esVip = verificarEstatusVIP(uid);
    
    // FILTRADO: Si es VIP ve todos. Si no, solo los suyos.
    const reportesParaMostrar = esVip 
        ? DB.reportes 
        : DB.reportes.filter(r => r.id_agente === uid);

    res.send(`
    <html>
    <head>
        <title>Radar AIFUCITO - ${esVip ? 'MODO ÉLITE' : 'MODO CIVIL'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css"/>
        <style>
            body { margin: 0; background: #050505; color: #00ff00; font-family: 'Courier New', monospace; }
            #map { height: 100vh; width: 100vw; }
            .blur-media { filter: blur(12px); cursor: not-allowed; border: 2px solid red; }
            .clear-media { filter: none; border: 2px solid #00ff00; }
            .popup-box { text-align: center; }
            .btn-vip { background: red; color: white; padding: 5px; cursor: pointer; display: block; margin-top: 5px; text-decoration: none; font-size: 10px; }
        </style>
    </head>
    <body>
        <div id="map"></div>
        <script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
        <script>
            var map = L.map('map').setView([-34.6, -58.4], 4);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);
            
            const reportes = ${JSON.stringify(reportesParaMostrar)};
            const esVip = ${esVip};
            const miId = ${uid};

            reportes.forEach(r => {
                if(r.lat && r.lng) {
                    let popupContent = "<div class='popup-box'><b>" + r.tipo + "</b><br>" + r.desc;
                    
                    if(r.media) {
                        // REGLA DE ORO: Si no es tuyo y no sos VIP, se ve borroso
                        const esMio = (r.id_agente === miId);
                        const clase = (esMio || esVip) ? 'clear-media' : 'blur-media';
                        
                        popupContent += "<br><img src='https://via.placeholder.com/150?text=EVIDENCIA' class='"+clase+"' style='width:120px; margin-top:10px;'>";
                        
                        if(!esMio && !esVip) {
                            popupContent += "<a href='#' class='btn-vip' onclick='alert(\"🚫 ACCESO DENEGADO: Mejorá a VIP para ver esta evidencia sin censura.\")'>DESBLOQUEAR EVIDENCIA</a>";
                        }
                    }
                    
                    popupContent += "</div>";
                    L.marker([r.lat, r.lng]).addTo(map).bindPopup(popupContent);
                }
            });
        </script>
    </body></html>`);
});

// --- COMANDOS MAESTROS (ADMINISTRACIÓN) ---
bot.command("activarvip", (ctx) => {
    if (!DB.admins_centrales.includes(ctx.from.id)) return ctx.reply("❌ No tenés autorización para desclasificar agentes.");
    const idParaVip = parseInt(ctx.message.text.split(" ")[1]);
    if (DB.agentes[idParaVip]) {
        DB.agentes[idParaVip].vip_pago = true;
        guardarTodo();
        ctx.reply(`💎 **SISTEMA:** Agente ${idParaVip} ascendido a Rango VIP Permanente.`, { chat_id: idParaVip });
        ctx.reply("✅ Agente activado.");
    }
});

// --- INICIO DE SERVICIOS ---
inicializarBases();
app.listen(PORT, () => {
    registrarLog(`SISTEMA OPERATIVO EN PUERTO ${PORT}`);
    bot.launch();
});
