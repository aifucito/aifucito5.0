/**
 * ==================================================================================
 * 🛰️ AIFUCITO OMEGA v5.0 FREE - SISTEMA DE INTELIGENCIA LOCAL
 * TODO INCLUIDO: RANGOS + MULTIMEDIA + RADAR + IA LOCAL (SIN COSTO)
 * ==================================================================================
 */

import { Telegraf, Markup, session } from 'telegraf';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'aifucito_db.json');
const TOKEN = process.env.BOT_TOKEN || "PON_AQUI_TU_TOKEN";
const PORT = process.env.PORT || 3000;
const PUBLIC_URL = "https://aifucito5-0.onrender.com";

/**
 * ==================================================================================
 * CANALES
 * ==================================================================================
 */

const CANALES = {
    GLOBAL: "-1002388657640",
    URUGUAY: "-1002347230353",
    ARGENTINA: "-1002410312674",
    CHILE: "-1002283925519"
};

/**
 * ==================================================================================
 * RANGOS
 * ==================================================================================
 */

const RANGOS = [
    { xp: 0, etiqueta: "Cadete 👶", desc: "Aún crees en globos meteorológicos." },
    { xp: 1500, etiqueta: "Vigía Nocturno 🔭", desc: "Detectas anomalías térmicas." },
    { xp: 5000, etiqueta: "Investigador 📡", desc: "Los Hombres de Negro te vigilan." },
    { xp: 12000, etiqueta: "Coronel del Cosmos 🎖️", desc: "Acceso a frecuencias prohibidas." },
    { xp: 30000, etiqueta: "Maestro de la Verdad 👽", desc: "La verdad te pide permiso." }
];

const calcularRango = (xp) => [...RANGOS].reverse().find(r => xp >= r.xp);

/**
 * ==================================================================================
 * SISTEMA DE PERSISTENCIA JSON
 * ==================================================================================
 */

class Persistence {

    constructor() {
        this.db = this.init();
        this.tokens = new Map();
    }

    init() {

        if (!fs.existsSync(DB_PATH)) {

            return {
                agentes: {},
                reportes: [],
                aprendizaje: {},
                config: { alerta:false }
            };
        }

        try {

            return JSON.parse(fs.readFileSync(DB_PATH,'utf8'));

        } catch {

            return {
                agentes: {},
                reportes: [],
                aprendizaje: {},
                config: { alerta:false }
            };

        }

    }

    async sync(){

        await fs.promises.writeFile(
            DB_PATH,
            JSON.stringify(this.db,null,2)
        );

    }

}

const Core = new Persistence();

/**
 * ==================================================================================
 * IA LOCAL CONSPIRANOICA
 * ==================================================================================
 */

class AifucitoAI {

    constructor(){

        this.memoria = {};
        this.base = this.cargarBase();

    }

    cargarBase(){

        return {

            nasa:[
                "La NASA afirma que todo está bajo control.",
                "Archivos desclasificados muestran eventos no explicados.",
                "Muchos creen que parte de la información sigue clasificada."
            ],

            luna:[
                "El alunizaje fue un logro histórico.",
                "Sin embargo existen teorías sobre estructuras detectadas.",
                "Algunas transmisiones nunca fueron difundidas."
            ],

            ovnis:[
                "Los OVNIs se reportan desde hace siglos.",
                "Pilotos militares describen objetos imposibles.",
                "Muchos casos siguen sin explicación."
            ],

            area51:[
                "Area 51 es una base militar secreta.",
                "Oficialmente es para pruebas aéreas.",
                "Algunos creen que estudian tecnología no humana."
            ],

            gobierno:[
                "Gobiernos investigan OVNIs desde hace décadas.",
                "Muchos documentos fueron desclasificados.",
                "Otros siguen ocultos."
            ]

        }

    }

    detectarTema(texto){

        texto = texto.toLowerCase();

        if(texto.includes("nasa")) return "nasa";
        if(texto.includes("luna")) return "luna";
        if(texto.includes("ovni")) return "ovnis";
        if(texto.includes("area 51")) return "area51";
        if(texto.includes("gobierno")) return "gobierno";

        return null;

    }

    responder(uid,texto){

        if(!this.memoria[uid]){

            this.memoria[uid] = {
                historial:[],
                temas:[]
            };

        }

        const user = this.memoria[uid];

        user.historial.push(texto);

        if(user.historial.length > 10){
            user.historial.shift();
        }

        const tema = this.detectarTema(texto);

        if(tema && this.base[tema]){

            const respuestas = this.base[tema];

            return respuestas[
                Math.floor(Math.random()*respuestas.length)
            ];

        }

        if(texto.toLowerCase().includes("hola")){
            return "Saludos agente. Los sensores observan el cielo.";
        }

        if(texto.toLowerCase().includes("quien eres")){
            return "Soy AIFUCITO. Nodo de análisis de anomalías.";
        }

        if(texto.toLowerCase().includes("verdad")){
            return "La verdad rara vez coincide con la versión oficial.";
        }

        return "Analizando señal... reformula tu pregunta.";

    }

}

const IA = new AifucitoAI();

/**
 * ==================================================================================
 * SERVIDOR WEB RADAR
 * ==================================================================================
 */

const app = express();

app.get('/radar/:token',(req,res)=>{

    const session = Core.tokens.get(req.params.token);

    if(!session || session.exp < Date.now())
        return res.status(403).send("ACCESO EXPIRADO");

    const heatData = Core.db.reportes
    .filter(r => r.lat != null && r.lng != null)
    .map(r => [r.lat,r.lng,0.8]);

    res.send(`
    <html>
    <head>
        <title>RADAR AIFU</title>
        <link rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
        <style>
        body{margin:0;background:#000}
        #map{height:100vh}
        </style>
    </head>

    <body>

    <div id="map"></div>

    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script src="https://leaflet.github.io/Leaflet.heat/dist/leaflet-heat.js"></script>

    <script>

    const map = L.map('map').setView([-34.6,-58.4],5);

    L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    ).addTo(map);

    map.locate({setView:true});

    map.on('locationfound',e=>{
        L.marker(e.latlng).addTo(map)
        .bindPopup("Estás aquí").openPopup();
    });

    const data = ${JSON.stringify(heatData)};

    L.heatLayer(data,{radius:25,blur:15}).addTo(map);

    </script>

    </body>
    </html>
    `);

});

app.get('/',(req,res)=>{

    res.send("AIFUCITO ONLINE");

});

/**
 * ==================================================================================
 * BOT TELEGRAM
 * ==================================================================================
 */

const bot = new Telegraf(TOKEN);

bot.use(session());

const UI = {

    main:(user)=>

    Markup.keyboard([
        ['🛸 REPORTAR AVISTAMIENTO','🌍 VER RADAR VIVO'],
        ['🤖 HABLAR CON AIFUCITO','⭐ MI EXPEDIENTE']
    ]).resize(),

    geo:

    Markup.keyboard([
        [Markup.button.locationRequest('📍 ENVIAR GPS')],
        ['❌ CANCELAR']
    ]).resize(),

    media:

    Markup.keyboard([
        ['✅ FINALIZAR REPORTE','❌ CANCELAR']
    ]).resize()

};

/**
 * ==================================================================================
 * MIDDLEWARE USUARIO
 * ==================================================================================
 */

bot.use(async(ctx,next)=>{

    if(!ctx.from) return;

    const uid = ctx.from.id;

    if(!Core.db.agentes[uid]){

        Core.db.agentes[uid] = {
            id:uid,
            nombre:ctx.from.first_name,
            xp:0,
            reportes:0,
            rango:"Cadete 👶"
        };

        await Core.sync();

    }

    const user = Core.db.agentes[uid];

    const rangoCalc = calcularRango(user.xp).etiqueta;

    if(user.rango !== rangoCalc){

        user.rango = rangoCalc;

        await ctx.reply(
        `ASCENSO DE RANGO\nNuevo rango: ${user.rango}`
        );

        await Core.sync();

    }

    ctx.state.user = user;

    return next();

});

/**
 * ==================================================================================
 * COMANDOS
 * ==================================================================================
 */

bot.start((ctx)=>{

    ctx.reply(
    `NODO AIFU ACTIVO\nAgente ${ctx.from.first_name}`,
    UI.main(ctx.state.user)
    );

});

bot.hears('🌍 VER RADAR VIVO',(ctx)=>{

    const token = crypto.randomBytes(12).toString('hex');

    Core.tokens.set(token,{
        exp:Date.now()+600000
    });

    ctx.reply(
    `${PUBLIC_URL}/radar/${token}`
    );

});

bot.hears('🛸 REPORTAR AVISTAMIENTO',(ctx)=>{

    ctx.session = {step:'LOC'};

    ctx.reply(
    "Envía tu ubicación GPS.",
    UI.geo
    );

});

/**
 * ==================================================================================
 * RECEPCIÓN GPS
 * ==================================================================================
 */

bot.on('location',async(ctx)=>{

    if(ctx.session?.step !== 'LOC') return;

    ctx.session.lat = ctx.message.location.latitude;
    ctx.session.lng = ctx.message.location.longitude;

    ctx.session.step = 'DESC';

    ctx.reply(
    "Describe lo que viste."
    );

});

/**
 * ==================================================================================
 * TEXTO
 * ==================================================================================
 */

bot.on('text',async(ctx)=>{

    const text = ctx.message.text;
    const user = ctx.state.user;

    if(text === '❌ CANCELAR'){

        ctx.session = null;

        return ctx.reply(
        "Operación cancelada.",
        UI.main(user)
        );

    }

    if(text === '🤖 HABLAR CON AIFUCITO'){

        ctx.session.chatAI = true;

        return ctx.reply(
        "Conexión con AIFUCITO establecida."
        );

    }

    if(text === '⭐ MI EXPEDIENTE'){

        return ctx.reply(
        `AGENTE: ${user.nombre}
RANGO: ${user.rango}
XP: ${user.xp}
REPORTES: ${user.reportes}`
        );

    }

    if(ctx.session?.step === 'DESC'){

        const reporte = {

            id:Date.now(),
            uid:user.id,
            lat:ctx.session.lat,
            lng:ctx.session.lng,
            desc:text,
            fecha:new Date().toLocaleString()

        };

        Core.db.reportes.push(reporte);

        user.xp += 300;
        user.reportes++;

        await Core.sync();

        const msg =
`ALERTA OVNI
${text}
Agente:${user.nombre}`;

        Object.values(CANALES)
        .forEach(c=>bot.telegram.sendMessage(c,msg).catch(()=>{}));

        ctx.reply(
        "Reporte archivado.",
        UI.main(user)
        );

        ctx.session = null;

        return;

    }

    if(ctx.session?.chatAI){

        const r = IA.responder(ctx.from.id,text);

        return ctx.reply("AIFUCITO: "+r);

    }

});

/**
 * ==================================================================================
 * LANZAMIENTO
 * ==================================================================================
 */

app.listen(PORT,'0.0.0.0',()=>{

    console.log("Servidor online "+PORT);

    bot.launch();

});
