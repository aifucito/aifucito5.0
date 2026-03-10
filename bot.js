import { Telegraf, Markup, session } from "telegraf";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ================================
   VARIABLES DE ENTORNO
================================ */

const TOKEN = process.env.TELEGRAM_TOKEN;
const LOCATION_IQ_KEY = process.env.LOCATION_IQ_KEY;

/* ================================
   RED DE CANALES AIFU
================================ */

const RED_AIFU = {

    // Canal central (recibe TODO con multimedia)
    ID_CONO_SUR: "-1002388657640",

    // Canales regionales (solo texto)
    ID_UY: "-1002347230353",
    ID_AR: "-1002410312674",
    ID_CH: "-1002283925519",

    // Otros países
    ID_GLOBAL: "-1002414775486",

    // Enlaces para que los usuarios se unan
    LINK_CONO_SUR: "https://t.me/+YqA6d3VpKv9mZjU5",
    LINK_GLOBAL: "https://t.me/+r5XfcJma3g03MWZh",
    LINK_UY: "https://t.me/+nCVD4NsOihIyNGFh",
    LINK_AR: "https://t.me/+QpErPk26SY05OGIx",
    LINK_CH: "https://t.me/+VP2T47eLvIowNmYx"
};

/* ================================
   BASE DE DATOS PERSISTENTE
================================ */

const DATA_DIR = "/opt/render/project/src/data";
const DB_PATH = path.join(DATA_DIR, "aifucito_db.json");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

let DB = {
    agentes: {},
    reportes: []
};

if (fs.existsSync(DB_PATH)) {
    try {
        DB = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    } catch {
        console.log("DB nueva creada");
    }
}

function guardarDB() {
    fs.writeFileSync(DB_PATH, JSON.stringify(DB, null, 4));
}

/* ================================
   BOT TELEGRAM
================================ */

const bot = new Telegraf(TOKEN);
bot.use(session());

function obtenerRango(usuario, id) {

    if (id == 7662736311) return "🛸 COMANDANTE INTERGALÁCTICO";

    const r = usuario.reportes || 0;

    if (r >= 10) return "👽 Investigador Senior";
    if (r >= 5) return "🔦 Cebador de Mate del Área 51";

    return "🧻 Fajinador de Retretes Espaciales";
}

function obtenerCanalPais(pais) {

    const p = pais.toLowerCase();

    if (p.includes("uruguay")) return RED_AIFU.ID_UY;
    if (p.includes("argentina")) return RED_AIFU.ID_AR;
    if (p.includes("chile")) return RED_AIFU.ID_CH;

    return RED_AIFU.ID_GLOBAL;
}

/* ================================
   MENÚ PRINCIPAL
================================ */

const menuPrincipal = () => Markup.keyboard([
    ["🛸 GENERAR REPORTE", "🌍 VER RADAR"],
    ["🔗 UNIRSE A MI GRUPO", "⭐ MI PERFIL"]
]).resize();

/* ================================
   COMANDO START
================================ */

bot.start((ctx) => {

    const id = ctx.from.id;

    if (!DB.agentes[id]) {

        DB.agentes[id] = {
            nombre: ctx.from.first_name,
            reportes: 0,
            token: crypto.randomBytes(8).toString("hex")
        };

        guardarDB();
    }

    ctx.reply("🛰️ NODO AIFUCITO ONLINE", menuPrincipal());
});

/* ================================
   PERFIL
================================ */

bot.hears("⭐ MI PERFIL", (ctx) => {

    const u = DB.agentes[ctx.from.id];

    ctx.reply(
`🪪 PERFIL DE AGENTE

👤 Nombre: ${u.nombre}
🎖️ Rango: ${obtenerRango(u, ctx.from.id)}
📊 Reportes: ${u.reportes}`
    );

});

/* ================================
   VER RADAR
================================ */

bot.hears("🌍 VER RADAR", (ctx) => {

    ctx.reply(
        "🛰️ Radar AIFU en vivo",
        Markup.inlineKeyboard([
            [Markup.button.url("ABRIR RADAR 🛰️", process.env.PUBLIC_URL)]
        ])
    );

});

/* ================================
   UNIRSE A CANALES
================================ */

bot.hears("🔗 UNIRSE A MI GRUPO", (ctx) => {

    ctx.reply("Selecciona tu zona:",

        Markup.inlineKeyboard([

            [
                Markup.button.url("Uruguay 🇺🇾", RED_AIFU.LINK_UY),
                Markup.button.url("Argentina 🇦🇷", RED_AIFU.LINK_AR)
            ],

            [
                Markup.button.url("Chile 🇨🇱", RED_AIFU.LINK_CH),
                Markup.button.url("Global 👽", RED_AIFU.LINK_GLOBAL)
            ],

            [
                Markup.button.url("Radar Cono Sur 🛰️", RED_AIFU.LINK_CONO_SUR)
            ]

        ])

    );

});

/* ================================
   GENERAR REPORTE
================================ */

bot.hears("🛸 GENERAR REPORTE", (ctx) => {

    ctx.session = { reporte: { paso: "ubicacion" } };

    ctx.reply(
        "📍 ¿Dónde ocurrió el avistamiento?",
        Markup.keyboard([
            [Markup.button.locationRequest("📍 ENVIAR MI GPS")],
            ["⌨️ ESCRIBIR CIUDAD"],
            ["❌ CANCELAR"]
        ]).resize()
    );

});

/* ================================
   CANCELAR
================================ */

bot.hears("❌ CANCELAR", (ctx) => {

    ctx.session = null;
    ctx.reply("Reporte cancelado.", menuPrincipal());

});

/* ================================
   FLUJO DE REPORTE
================================ */

bot.on(["location","text","photo","video"], async (ctx)=>{

    if(!ctx.session?.reporte) return;

    const r = ctx.session.reporte;

    /* UBICACION GPS */

    if(r.paso === "ubicacion"){

        if(ctx.message.location){

            r.lat = ctx.message.location.latitude;
            r.lng = ctx.message.location.longitude;

            try{

                const geo = await axios.get(
                    `https://us1.locationiq.com/v1/reverse.php`,
                    {
                        params:{
                            key:LOCATION_IQ_KEY,
                            lat:r.lat,
                            lon:r.lng,
                            format:"json"
                        }
                    }
                );

                r.pais = geo.data.address.country || "Desconocido";
                r.ciudad = geo.data.address.city ||
                           geo.data.address.town ||
                           geo.data.address.village ||
                           "Zona rural";

            }catch{

                r.pais = "Desconocido";
                r.ciudad = "Coordenadas GPS";

            }

            r.paso="descripcion";

            return ctx.reply("¿Qué viste en el cielo?",Markup.removeKeyboard());

        }

        if(ctx.message.text?.includes("ESCRIBIR")){

            r.paso="pais";
            return ctx.reply("Escribe el PAÍS:",Markup.removeKeyboard());

        }

    }

    if(r.paso==="pais"){

        r.pais = ctx.message.text;
        r.paso="ciudad";

        return ctx.reply("Escribe la CIUDAD");

    }

    if(r.paso==="ciudad"){

        r.ciudad = ctx.message.text;

        try{

            const g = await axios.get(
                "https://us1.locationiq.com/v1/search.php",
                {
                    params:{
                        key:LOCATION_IQ_KEY,
                        q:`${r.ciudad}, ${r.pais}`,
                        format:"json",
                        limit:1
                    }
                }
            );

            r.lat = parseFloat(g.data[0].lat);
            r.lng = parseFloat(g.data[0].lon);

        }catch{

            r.lat=-34.9;
            r.lng=-56.16;

        }

        r.paso="descripcion";

        return ctx.reply("¿Qué viste en el cielo?");

    }

    if(r.paso==="descripcion"){

        r.desc = ctx.message.text;
        r.paso="mov";

        return ctx.reply(
            "¿Movimiento?",
            Markup.keyboard([["SÍ","NO","ERRÁTICO"]]).resize()
        );

    }

    if(r.paso==="mov"){

        r.mov = ctx.message.text;
        r.paso="media";

        return ctx.reply(
            "Envía FOTO o VIDEO. O presiona:",
            Markup.keyboard([["🚫 SIN EVIDENCIA"]]).resize()
        );

    }

    if(r.paso==="media"){

        if(ctx.message.photo){

            r.fileId = ctx.message.photo.pop().file_id;
            r.tipo="foto";

        }

        if(ctx.message.video){

            r.fileId = ctx.message.video.file_id;
            r.tipo="video";

        }

        if(ctx.message.text==="🚫 SIN EVIDENCIA"){}

        return finalizarReporte(ctx,r);

    }

});

/* ================================
   FINALIZAR REPORTE
================================ */

async function finalizarReporte(ctx,r){

    const u = DB.agentes[ctx.from.id];

    if(u) u.reportes++;

    const nuevo = {

        lat:r.lat,
        lng:r.lng,
        pais:r.pais,
        ciudad:r.ciudad,
        fecha:new Date().toISOString(),
        descripcion:r.desc,
        movimiento:r.mov,
        agente:u?.nombre || "Anónimo"

    };

    DB.reportes.push(nuevo);
    guardarDB();

    const txtCentral =
`🚨 NUEVO AVISTAMIENTO

📍 ${nuevo.ciudad}, ${nuevo.pais}
👤 Agente: ${nuevo.agente}
🚀 Movimiento: ${nuevo.movimiento}

📝 ${nuevo.descripcion}`;

    const txtPais =
`📡 REPORTE AIFU

📍 ${nuevo.ciudad}, ${nuevo.pais}
👤 Agente: ${nuevo.agente}

📝 ${nuevo.descripcion}`;

    try{

        if(r.fileId){

            if(r.tipo==="foto")
                await ctx.telegram.sendPhoto(RED_AIFU.ID_CONO_SUR,r.fileId,{caption:txtCentral});

            else
                await ctx.telegram.sendVideo(RED_AIFU.ID_CONO_SUR,r.fileId,{caption:txtCentral});

        }else{

            await ctx.telegram.sendMessage(RED_AIFU.ID_CONO_SUR,txtCentral);

        }

    }catch(e){

        console.log("Error enviando a Cono Sur");

    }

    try{

        const canalPais = obtenerCanalPais(nuevo.pais);
        await ctx.telegram.sendMessage(canalPais,txtPais);

    }catch{

        console.log("Error canal país");

    }

    ctx.session=null;

    return ctx.reply("✅ Reporte integrado al Radar AIFU.",menuPrincipal());

}

/* ================================
   SERVIDOR WEB
================================ */

const app = express();

app.use(express.static("public"));

app.get("/api/reportes",(req,res)=>{

    res.json(DB.reportes);

});

app.get("/",(req,res)=>{

    res.sendFile(path.join(__dirname,"public","index.html"));

});

/* ================================
   LANZAMIENTO
================================ */

bot.launch().then(()=>{

    console.log("AIFUCITO ONLINE");

});

const PORT = process.env.PORT || 10000;

app.listen(PORT,()=>{

    console.log("Servidor activo en puerto "+PORT);

});
