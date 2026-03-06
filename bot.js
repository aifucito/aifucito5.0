/**
 * ==================================================================================
 * 🛰️ AIFUCITO 5.0 - NODO CENTRAL DEFINITIVO
 * NODO CENTRAL: Aifu Radar Cono Sur (-1002388657640)
 * ==================================================================================
 * [SISTEMA DE OPERACIONES COMPLETAMENTE BLINDADO]
 * - MAPA GLOBAL FUNCIONAL: Vinculado al UID del agente. Filtro de borrosidad activo.
 * - PERFIL FUNCIONAL: Cálculo de XP y jerarquía real.
 * - HISTORIAS VIP: Lectura y escritura con modo anónimo oculto en el texto.
 * - CHARLA NATIVA: Aifucito aprende de forma local y humana.
 * - REPORTE DE AVISTAMIENTOS: Ruteo al Canal Central y al Canal Global/Regional.
 * ==================================================================================
 */

import { Telegraf, Markup, session } from "telegraf";
import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import fetch from "node-fetch";

// ==================================================================================
// 1. CONFIGURACIÓN DE RED Y CANALES
// ==================================================================================
const CANAL_CENTRAL = "-1002388657640"; 
const CANALES_REGIONALES = {
    URUGUAY: "-1002347230353",
    ARGENTINA: "-1002410312674",
    CHILE: "-1002283925519",
    OTROS_PAISES: "-1002414775486" // 🌍 CANAL GLOBAL
};

const TOKEN = process.env.BOT_TOKEN || "8701174108:AAFgEE-uSZlDvrTNm_QIeDIINqmnCzQIOCM";
const PORT = process.env.PORT || 10000;
const PUBLIC_URL = "https://aifucito.onrender.com";

// El Gran Corte VIP: Sábado 14 de Marzo de 2026, 00:00:00
const FECHA_CORTE_VIP = new Date("2026-03-14T00:00:00").getTime();

// ==================================================================================
// 2. PERSISTENCIA Y BASES DE DATOS MASIVAS
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

// El Cerebro de Aifucito (Base de conocimiento extensa para que no empiece vacío)
let BRAIN = { 
    vocabulario: { 
        "hola": "¡Hola, hola, Agente! ¡Qué alegría verte por el radar! ¿Viste algo raro hoy por el cielo?",
        "ovni": "¡Las naves de ellos! O de nosotros... ¿quién sabe? Pero que están, están. Nosotros las registramos.",
        "aifucito": "¡Ese soy yo! Tu compañero de conspiraciones y oficial de enlace en el radar global.",
        "cono sur": "Nuestra base central. Uruguay, Argentina y Chile, la zona más caliente de avistamientos.",
        "uruguay": "Tierra de misterios, amigo. Desde la Estancia La Aurora hasta las luces en el Río de la Plata.",
        "argentina": "El Uritorco, la Patagonia, Victoria... Argentina es un hervidero de fenómenos, che.",
        "chile": "Nuestros hermanos del otro lado de la cordillera. ¡Tienen de los mejores ufólogos del mundo!",
        "vip": "La élite de la red. Solo los que tienen este rango ven la verdad sin que se la borroneen.",
        "verdad": "La verdad es esquiva, camarada, pero con este bot la vamos a acorralar paso a paso.",
        "miedo": "¡Acá no hay miedo! Acá hay curiosidad, mate y método científico, Agente.",
        "radar": "Nuestra herramienta principal. El mapa de calor donde marcamos lo que los radares oficiales ignoran."
    }, 
    desconocido: [] 
};

// --- SISTEMA DE GESTIÓN DE ARCHIVOS ---
function inicializarBases() {
    try {
        if (fs.existsSync(DB_PATH)) DB = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
        if (fs.existsSync(BRAIN_PATH)) BRAIN = JSON.parse(fs.readFileSync(BRAIN_PATH, "utf8"));
        registrarLog("SISTEMA: Bases de datos cargadas con éxito en memoria.");
    } catch (e) {
        registrarLog("ERROR: Fallo en la carga de bases de datos JSON.");
    }
}

const guardarTodo = () => {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(DB, null, 4));
        fs.writeFileSync(BRAIN_PATH, JSON.stringify(BRAIN, null, 4));
    } catch (e) {
        registrarLog("ERROR CRÍTICO: No se pudo guardar en disco.");
    }
};

const registrarLog = (msg) => {
    const entry = `[${new Date().toLocaleString()}] ${msg}\n`;
    fs.appendFileSync(LOG_PATH, entry);
    console.log(entry);
};

inicializarBases();

// ==================================================================================
// 3. MOTOR DE VALIDACIÓN VIP
// ==================================================================================
const verificarVIP = (id) => {
    const ahora = Date.now();
    // Administradores eternos
    if (DB.admins_centrales.includes(id)) return true;
    // Si pagó el VIP y fue activado
    if (DB.agentes[id]?.vip_pago === true) return true;
    // Periodo de prueba hasta el Viernes 13
    if (ahora < FECHA_CORTE_VIP) return true;
    // Si no cumple nada, es Usuario Estándar
    return false;
};

// ==================================================================================
// 4. INICIALIZACIÓN DEL BOT TELEGRAF
// ==================================================================================
const bot = new Telegraf(TOKEN);
bot.use(session());

const menuPrincipal = (ctx) => {
    const esVip = verificarVIP(ctx.from.id);
    let botones = [
        ["🛸 REPORTAR AVISTAMIENTO", "🌍 MAPA GLOBAL"],
        ["🤖 CHARLAR CON AIFUCITO", "⭐ MI PERFIL"]
    ];
    // El botón de Historias solo aparece si es VIP
    if (esVip) {
        botones.push(["📚 HISTORIAS VIP"]);
    }
    return Markup.keyboard(botones).resize();
};

// --- COMANDO DE INICIO ---
bot.start((ctx) => {
    const id = ctx.from.id;
    if (!DB.agentes[id]) {
        DB.agentes[id] = {
            id,
            nombre: ctx.from.first_name || "Agente",
            vip_pago: false,
            reportes_totales: 0,
            xp: 100,
            fecha_registro: new Date().toISOString()
        };
        guardarTodo();
    }
    registrarLog(`ACCESO: Agente ${ctx.from.first_name} inició el sistema.`);
    ctx.reply(`🛸 **SISTEMA AIFUCITO 5.0 ONLINE**\n\n¡Qué hacés, camarada! Soy AIFUCITO, tu oficial de enlace.\n\n⚠️ **ESTADO DE LA RED:** Fase de prueba abierta. Tenés acceso VIP TOTAL hasta el Viernes 13 a las 23:59:59. ¡Aprovechá para desclasificar todo el material que puedas!`, menuPrincipal(ctx));
});

// ==================================================================================
// 5. MÓDULOS DE FUNCIONALIDAD (BOTONES EXACTOS)
// ==================================================================================

// --- MÓDULO: MI PERFIL ---
bot.hears("⭐ MI PERFIL", (ctx) => {
    const id = ctx.from.id;
    const u = DB.agentes[id];
    if (!u) return ctx.reply("Error: Tu perfil no fue encontrado en la base de datos.");
    
    const estatus = verificarVIP(id) ? "💎 ÉLITE (VIP / ADMIN)" : "👤 CIVIL (ESTÁNDAR)";
    const nivel = u.xp > 5000 ? "Coronel Ufológico" : u.xp > 1000 ? "Cazador Avanzado" : "Iniciado";
    
    ctx.replyWithMarkdown(`🕵️ **EXPEDIENTE DE INTELIGENCIA**\n━━━━━━━━━━━━━━\n👤 **Agente:** ${u.nombre}\n🎫 **Rango:** ${estatus}\n🎖️ **Nivel:** ${nivel}\n📡 **Reportes Desclasificados:** ${u.reportes_totales}\n⭐ **Puntos de Experiencia:** ${u.xp} XP\n━━━━━━━━━━━━━━\n_Sigue vigilando el cielo, la comunidad depende de vos._`);
});

// --- MÓDULO: MAPA GLOBAL ---
bot.hears("🌍 MAPA GLOBAL", (ctx) => {
    const uid = ctx.from.id;
    const esVip = verificarVIP(uid);
    const aviso = esVip ? "Tenés acceso total a todas las coordenadas sin censura." : "⚠️ Al no tener VIP, solo verás tus reportes nítidos. La evidencia ajena ha sido borroneada.";
    
    ctx.reply(`🛰️ **SISTEMA DE RASTREO SATELITAL ACTIVO**\n\n${aviso}\n\n🔗 [ENTRAR AL RADAR TÁCTICO AQUÍ](${PUBLIC_URL}/radar?uid=${uid})`, { parse_mode: "Markdown" });
});

// --- MÓDULO: CHARLA CON LA IA NATIVA ---
bot.hears("🤖 CHARLAR CON AIFUCITO", (ctx) => {
    ctx.session.chateando = true;
    ctx.reply("¡ACÁ ESTOY, CHE! 🤖\n\nHablame de lo que quieras: teorías, avistamientos o conspiraciones. Si hay algo que no sé, me lo enseñás vos y lo guardo para siempre. (Escribí **SALIR** para terminar la comunicación)");
});

// --- MÓDULO: HISTORIAS VIP ---
bot.hears("📚 HISTORIAS VIP", (ctx) => {
    if (!verificarVIP(ctx.from.id)) return ctx.reply("❌ **ACCESO DENEGADO**\n\nTu nivel de seguridad es insuficiente. Necesitás Rango VIP para acceder a los archivos clasificados de otros agentes.");
    
    ctx.reply("📖 **BÓVEDA DE HISTORIAS PROHIBIDAS**\n\n¿Qué querés hacer, Agente de Élite?", Markup.inlineKeyboard([
        [Markup.button.callback("📖 Leer Archivos", "ver_blog")],
        [Markup.button.callback("✍️ Desclasificar Historia", "escribir_blog")]
    ]));
});

bot.action("ver_blog", (ctx) => {
    if (DB.historias.length === 0) return ctx.answerCbQuery("Los archivos están vacíos por ahora.", { show_alert: true });
    
    let contenido = "📝 **ÚLTIMOS INCIDENTES REGISTRADOS:**\n\n";
    DB.historias.slice(-6).reverse().forEach(h => {
        contenido += `👤 **${h.autor}**\n📜 "${h.texto}"\n📅 _${h.fecha}_\n━━━━━━━━━━━━━━\n`;
    });
    ctx.replyWithMarkdown(contenido);
});

bot.action("escribir_blog", (ctx) => {
    ctx.session.escribiendo_historia = true;
    ctx.reply("✍️ **MODO REDACCIÓN ACTIVO**\n\nEscribí tu experiencia. \n💡 *Secreto:* Si empezás tu texto con la palabra **ANONIMO**, tu identidad será borrada del registro y aparecerás como Agente Fantasma.");
});

// --- MÓDULO: REPORTE DE AVISTAMIENTO ---
bot.hears("🛸 REPORTAR AVISTAMIENTO", (ctx) => {
    ctx.session.reporte = { paso: "tipo" };
    ctx.reply("🛸 ¡Vamos a registrar eso ya mismo!\n\n¿Qué categoría de objeto observaste?", 
        Markup.keyboard([
            ["🛸 OVNI", "✨ Luz Anómala"], 
            ["👽 Entidad Biológica", "🌀 Otro Fenómeno"], 
            ["❌ CANCELAR"]
        ]).resize()
    );
});

// ==================================================================================
// 6. EL CEREBRO PROCESADOR: MANEJADOR DE TEXTO GLOBAL
// ==================================================================================
bot.on("text", async (ctx) => {
    const txt = ctx.message.text;
    const id = ctx.from.id;

    // 1. Interrupciones de seguridad
    if (txt === "❌ CANCELAR" || txt.toUpperCase() === "SALIR") {
        ctx.session.reporte = null;
        ctx.session.chateando = false;
        ctx.session.escribiendo_historia = false;
        ctx.session.aprendiendo_de_vos = false;
        return ctx.reply("¡Entendido! Operación cancelada. Limpiando el caché y volviendo a la base.", menuPrincipal(ctx));
    }

    // 2. Lógica de Redacción en el Blog
    if (ctx.session.escribiendo_historia) {
        const esAnonimo = txt.toUpperCase().startsWith("ANONIMO");
        const textoLimpio = esAnonimo ? txt.substring(7).trim() : txt;
        
        DB.historias.push({
            autor: esAnonimo ? "Agente Fantasma 🕵️" : ctx.from.first_name,
            texto: textoLimpio,
            fecha: new Date().toLocaleDateString()
        });
        
        guardarTodo();
        ctx.session.escribiendo_historia = false;
        return ctx.reply("✅ **OPERACIÓN EXITOSA:** Tu historia ha sido incrustada en la bóveda VIP de AIFUCITO 5.0.", menuPrincipal(ctx));
    }

    // 3. Lógica de Aprendizaje (AIFUCITO como alumno)
    if (ctx.session.aprendiendo_de_vos) {
        const palabraOriginal = ctx.session.aprendiendo_de_vos;
        BRAIN.vocabulario[palabraOriginal] = txt;
        delete ctx.session.aprendiendo_de_vos;
        guardarTodo();
        return ctx.reply(`✨ ¡ESPECTACULAR! ✨ Ya me quedó grabado en el cerebro que **"${palabraOriginal}"** significa: _${txt}_. ¡Gracias por hacerme más inteligente, camarada!`, menuPrincipal(ctx));
    }

    // 4. Lógica de Charla Activa
    if (ctx.session.chateando) {
        const msg = txt.toLowerCase();
        let respuestaEncontrada = null;

        for (const [clave, respuesta] of Object.entries(BRAIN.vocabulario)) {
            if (msg.includes(clave)) {
                respuestaEncontrada = respuesta;
                break;
            }
        }

        if (respuestaEncontrada) {
            return ctx.reply(respuestaEncontrada);
        } else {
            // No entiende, pide ayuda humana
            ctx.session.aprendiendo_de_vos = msg;
            if (!BRAIN.desconocido.includes(msg)) BRAIN.desconocido.push(msg);
            guardarTodo();
            return ctx.reply(`🤔 ¡Epa! Me mataste, che... **"${msg}"** no lo tengo en mis archivos de memoria. ¿Me explicás qué significa o qué quiere decir? Así aprendo.`);
        }
    }

    // 5. Flujo del Reporte de Avistamiento
    if (ctx.session.reporte) {
        const r = ctx.session.reporte;

        if (r.paso === "tipo") {
            r.tipo = txt;
            r.paso = "ubicacion";
            return ctx.reply("📍 **GEOLOCALIZACIÓN**\n\nNecesitamos las coordenadas. Podés enviarme tu GPS directamente o escribir manualmente el lugar.", 
                Markup.keyboard([
                    [Markup.button.locationRequest("📍 Enviar mi GPS")], 
                    ["✍️ Escribir Manualmente"], 
                    ["❌ CANCELAR"]
                ]).resize()
            );
        }

        if (r.paso === "manual_ubi") {
            ctx.reply("🔍 Rastrendo posición en los servidores cartográficos...");
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(txt)}&limit=1`);
                const data = await res.json();
                if (data && data[0]) {
                    r.lat = parseFloat(data[0].lat);
                    r.lng = parseFloat(data[0].lon);
                    r.lugar = txt;
                    r.paso = "desc";
                    return ctx.reply(`✅ **SECTOR DETECTADO:** ${data[0].display_name}\n\n📝 Ahora describí detalladamente lo que presenciaste (color, movimiento, velocidad):`);
                } else {
                    return ctx.reply("⚠️ Satélites ciegos en esa zona. Por favor, escribí Ciudad y País de forma más clara:");
                }
            } catch (e) {
                return ctx.reply("Error de triangulación. Intentá de nuevo:");
            }
        }

        if (r.paso === "desc") {
            r.desc = txt;
            r.paso = "media";
            return ctx.reply("📸 **RECOPILACIÓN DE EVIDENCIA**\n\nSi tenés material gráfico (foto o video), envialo ahora. Si no lograste capturar nada, escribí la palabra **FIN** para sellar el expediente.", Markup.removeKeyboard());
        }

        if (txt.toUpperCase() === "FIN" && r.paso === "media") {
            return finalizarReporte(ctx);
        }
    }
});

// --- MANEJO DE TECLADOS SECUNDARIOS ---
bot.hears("✍️ Escribir Manualmente", (ctx) => {
    if (ctx.session.reporte && ctx.session.reporte.paso === "ubicacion") {
        ctx.session.reporte.paso = "manual_ubi";
        ctx.reply("Escribí el País, Provincia y Ciudad lo más exacto posible:", Markup.removeKeyboard());
    }
});

// --- MANEJO DE UBICACIÓN Y MULTIMEDIA ---
bot.on("location", (ctx) => {
    if (ctx.session.reporte && ctx.session.reporte.paso === "ubicacion") {
        ctx.session.reporte.lat = ctx.message.location.latitude;
        ctx.session.reporte.lng = ctx.message.location.longitude;
        ctx.session.reporte.lugar = "Coordenadas GPS Directas";
        ctx.session.reporte.paso = "desc";
        ctx.reply("📍 Coordenadas encriptadas y guardadas. Ahora decime, ¿qué fue lo que viste?", Markup.removeKeyboard());
    }
});

bot.on(["photo", "video"], async (ctx) => {
    if (ctx.session.reporte && ctx.session.reporte.paso === "media") {
        ctx.session.reporte.media = ctx.message.photo ? ctx.message.photo.pop().file_id : ctx.message.video.file_id;
        ctx.session.reporte.mType = ctx.message.photo ? "photo" : "video";
        ctx.reply("💾 Subiendo evidencia a los servidores encriptados...");
        await finalizarReporte(ctx);
    }
});

// ==================================================================================
// 7. EL MOTOR DE DISTRIBUCIÓN: RUTEO CENTRAL Y REGIONAL
// ==================================================================================
async function finalizarReporte(ctx) {
    const r = ctx.session.reporte;
    const u = DB.agentes[ctx.from.id];
    
    const nuevoExpediente = {
        id: crypto.randomBytes(4).toString("hex"),
        id_agente: ctx.from.id, // Fundamental para el filtro de censura en el mapa
        agente: ctx.from.first_name,
        tipo: r.tipo,
        desc: r.desc,
        lat: r.lat || 0,
        lng: r.lng || 0,
        lugar: r.lugar || "Sector Global No Identificado",
        media: r.media || null,
        mType: r.mType || null,
        fecha: new Date().toLocaleString()
    };

    // Premiamos al agente
    DB.reportes.push(nuevoExpediente);
    u.reportes_totales++;
    u.xp += 1500;
    guardarTodo();
    registrarLog(`NUEVO REPORTE: Agente ${nuevoExpediente.agente} registró un ${nuevoExpediente.tipo}`);

    const mensajeAlerta = `🚨 **NUEVO EXPEDIENTE: AIFUCITO 5.0** 🚨\n━━━━━━━━━━━━━━\n🕵️ **Agente:** ${nuevoExpediente.agente}\n🛸 **Clasificación:** ${nuevoExpediente.tipo}\n📍 **Sector:** ${nuevoExpediente.lugar}\n📝 **Testimonio:** ${nuevoExpediente.desc}\n━━━━━━━━━━━━━━`;

    // PASO A: Envío obligatorio al NODO CENTRAL
    try {
        if (nuevoExpediente.media) {
            if (nuevoExpediente.mType === "photo") {
                await bot.telegram.sendPhoto(CANAL_CENTRAL, nuevoExpediente.media, { caption: mensajeAlerta, parse_mode: "Markdown" });
            } else {
                await bot.telegram.sendVideo(CANAL_CENTRAL, nuevoExpediente.media, { caption: mensajeAlerta, parse_mode: "Markdown" });
            }
        } else {
            await bot.telegram.sendMessage(CANAL_CENTRAL, mensajeAlerta, { parse_mode: "Markdown" });
        }
    } catch (e) { registrarLog("Fallo de red al enviar a Canal Central"); }

    // PASO B: Inteligencia de Ruteo Regional / Global
    const ubicacionStr = nuevoExpediente.lugar.toLowerCase();
    let idDestinoRegional = CANALES_REGIONALES.OTROS_PAISES; // Por defecto cae en el Canal Global
    let etiquetaRegional = "🌍 REPORTE GLOBAL";

    if (ubicacionStr.includes("uruguay")) {
        idDestinoRegional = CANALES_REGIONALES.URUGUAY;
        etiquetaRegional = "🇺🇾 REPORTE URUGUAY";
    } else if (ubicacionStr.includes("argentina")) {
        idDestinoRegional = CANALES_REGIONALES.ARGENTINA;
        etiquetaRegional = "🇦🇷 REPORTE ARGENTINA";
    } else if (ubicacionStr.includes("chile")) {
        idDestinoRegional = CANALES_REGIONALES.CHILE;
        etiquetaRegional = "🇨🇱 REPORTE CHILE";
    }

    // Ejecutar envío a la sucursal correspondiente
    try {
        const mensajeSucursal = `📡 **${etiquetaRegional}**\n\n${mensajeAlerta}`;
        if (nuevoExpediente.media) {
            if (nuevoExpediente.mType === "photo") {
                await bot.telegram.sendPhoto(idDestinoRegional, nuevoExpediente.media, { caption: mensajeSucursal, parse_mode: "Markdown" });
            } else {
                await bot.telegram.sendVideo(idDestinoRegional, nuevoExpediente.media, { caption: mensajeSucursal, parse_mode: "Markdown" });
            }
        } else {
            await bot.telegram.sendMessage(idDestinoRegional, mensajeSucursal, { parse_mode: "Markdown" });
        }
    } catch (e) { registrarLog(`Fallo de red al enviar a Sucursal ${etiquetaRegional}`); }

    // Limpiar sesión y avisar al usuario
    ctx.session.reporte = null;
    ctx.reply("✅ **MISION CUMPLIDA**\n\nEl reporte ha sido desclasificado y distribuido a través de la red AIFUCITO 5.0. Ganaste 1500 XP.", menuPrincipal(ctx));
}

// ==================================================================================
// 8. COMANDOS DE ADMINISTRACIÓN (SOLO JEFES)
// ==================================================================================
bot.command("activarvip", (ctx) => {
    const miId = ctx.from.id;
    if (!DB.admins_centrales.includes(miId)) return ctx.reply("❌ Violación de seguridad: No tenés acceso a este comando.");
    
    // Formato: /activarvip 12345678
    const partes = ctx.message.text.split(" ");
    if (partes.length < 2) return ctx.reply("Falta el ID del agente.");
    
    const targetId = parseInt(partes[1]);
    if (DB.agentes[targetId]) {
        DB.agentes[targetId].vip_pago = true;
        guardarTodo();
        ctx.reply(`✅ Operación de jerarquía completada: El Agente ${targetId} ahora es VIP de forma permanente.`);
    } else {
        ctx.reply("❌ Error: No se encontró un agente con ese ID en los registros.");
    }
});

// ==================================================================================
// 9. SERVIDOR WEB Y MOTOR RENDERIZADOR DEL MAPA (CON CENSURA DINÁMICA)
// ==================================================================================
const app = express();
app.use(express.json());

app.get("/", (req, res) => res.send("📡 AIFUCITO 5.0 CORE IS LISTENING..."));

app.get("/radar", (req, res) => {
    const uid = parseInt(req.query.uid);
    if (!uid) return res.send("<h1>Error 403: Identificación requerida para acceder al radar.</h1>");

    const esVip = verificarVIP(uid);
    
    // FILTRO DE SEGURIDAD ABSOLUTO: 
    // Si sos VIP, la base te entrega todo el Array.
    // Si sos Civil (Estándar), la base hace un filter() y te da SOLO tus reportes para que ubiques.
    const reportesAutorizados = esVip 
        ? DB.reportes 
        : DB.reportes.filter(rep => rep.id_agente === uid);

    const htmlRender = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="utf-8" />
            <title>Radar AIFUCITO 5.0</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
            <link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css" />
            <style>
                body { margin: 0; padding: 0; background-color: #0b0e14; color: #00ff00; font-family: 'Courier New', Courier, monospace; }
                #map { height: 100vh; width: 100vw; z-index: 1; }
                .hud { position: absolute; top: 15px; left: 50%; transform: translateX(-50%); z-index: 1000; background: rgba(0,20,0,0.85); padding: 12px 20px; border: 2px solid #00ff00; border-radius: 8px; box-shadow: 0 0 15px #00ff00; text-align: center; text-transform: uppercase; font-weight: bold; letter-spacing: 2px; pointer-events: none; }
                
                /* CLASES PARA EL SISTEMA DE CENSURA MULTIMEDIA */
                .media-box { margin-top: 10px; width: 140px; height: auto; border-radius: 4px; }
                .media-clara { border: 2px solid #00ff00; }
                .media-censurada { filter: blur(14px) grayscale(100%); pointer-events: none; border: 2px solid red; }
                
                .censura-texto { color: red; font-size: 11px; font-weight: bold; margin-top: 5px; display: block; text-decoration: none; background: rgba(255,0,0,0.2); padding: 5px; border-radius: 3px; }
                
                .leaflet-popup-content-wrapper { background: rgba(10,10,10,0.9); color: #00ff00; border: 1px solid #00ff00; }
                .leaflet-popup-tip { background: #00ff00; }
            </style>
        </head>
        <body>
            <div class="hud">🛰️ TERMINAL RADAR 5.0 <br> MODO: <span style="color:${esVip ? '#00ffff' : '#ff0000'};">${esVip ? 'DESCLASIFICADO [VIP]' : 'RESTRINGIDO [CIVIL]'}</span></div>
            <div id="map"></div>
            
            <script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
            <script>
                // Inicializar mapa sobre Cono Sur
                var map = L.map('map', { zoomControl: false }).setView([-34.6037, -58.3816], 4);
                
                // Capa Dark Matter de CartoDB (Militar/Nocturna)
                L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                    attribution: '&copy; AIFUCITO Intelligence Network'
                }).addTo(map);

                // Inyectar base de datos procesada por Express
                const data = ${JSON.stringify(reportesAutorizados)};
                const esVip = ${esVip};
                const miID = ${uid};

                data.forEach(r => {
                    if (r.lat !== 0 && r.lng !== 0) {
                        
                        // Construcción del Popup
                        let html = "<div style='text-align:center;'>";
                        html += "<strong style='font-size:14px; border-bottom:1px solid #00ff00; padding-bottom:3px; display:block;'>" + r.tipo + "</strong>";
                        html += "<p style='font-size:12px; margin: 8px 0;'>" + r.desc + "</p>";
                        html += "<small style='color:#aaaaaa;'>Agente: " + r.agente + "</small>";

                        // Lógica de Evidencia Gráfica (Aplicación de Blur)
                        if (r.media) {
                            const esMio = (r.id_agente === miID);
                            
                            if (esVip || esMio) {
                                // Si sos VIP o el reporte es tuyo, lo ves perfecto
                                html += "<br><img src='https://via.placeholder.com/150/00ff00/000000?text=EVIDENCIA+OK' class='media-box media-clara' alt='Evidencia'>";
                            } else {
                                // Si NO sos VIP y el reporte NO es tuyo, se censura fuertemente
                                html += "<br><img src='https://via.placeholder.com/150/ff0000/000000?text=CENSURADO' class='media-box media-censurada' alt='Censurado'>";
                                html += "<a href='#' class='censura-texto' onclick='alert(\"⚠️ ACCESO DENEGADO: Archivo clasificado. Contacte a un administrador para ascender a Rango VIP y desbloquear la evidencia.\"); return false;'>🔒 DESBLOQUEAR EVIDENCIA</a>";
                            }
                        }
                        
                        html += "</div>";

                        // Círculo táctico
                        L.circleMarker([r.lat, r.lng], {
                            color: esVip ? '#00ffff' : '#ff0000',
                            fillColor: esVip ? '#00ffff' : '#ff0000',
                            fillOpacity: 0.6,
                            radius: 7,
                            weight: 2
                        }).addTo(map).bindPopup(html);
                    }
                });
            </script>
        </body>
        </html>
    `;
    res.send(htmlRender);
});

// ==================================================================================
// 10. ENCENDIDO DEL NÚCLEO
// ==================================================================================
app.listen(PORT, '0.0.0.0', () => {
    console.log("==================================================");
    console.log(` 🛰️ NODO AIFUCITO 5.0 ONLINE EN PUERTO ${PORT} `);
    console.log("==================================================");
    
    bot.launch()
        .then(() => registrarLog("SISTEMA: Conexión con servidores de Telegram establecida exitosamente."))
        .catch((err) => registrarLog("ERROR CRÍTICO: Fallo al conectar con Telegram: " + err));
});

// Protocolos de apagado seguro (Graceful Stop)
process.once('SIGINT', () => {
    registrarLog("SISTEMA: Señal SIGINT recibida. Apagando motores...");
    bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
    registrarLog("SISTEMA: Señal SIGTERM recibida. Apagando motores...");
    bot.stop('SIGTERM');
});
