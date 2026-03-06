/**
 * ==================================================================================
 * 🛰️ AIFUCITO 5.0 - NODO CENTRAL DEFINITIVO
 * ==================================================================================
 */

import { Telegraf, Markup, session } from "telegraf";
import express from "express";
import fs from "fs";
import crypto from "crypto";
import fetch from "node-fetch";

// ==================================================================================
// CONFIGURACIÓN
// ==================================================================================

const CANAL_CENTRAL = "-1002388657640";

const CANALES_REGIONALES = {
    URUGUAY: "-1002347230353",
    ARGENTINA: "-1002410312674",
    CHILE: "-1002283925519",
    OTROS_PAISES: "-1002414775486"
};

const TOKEN = process.env.BOT_TOKEN || "TU_TOKEN";
const PORT = process.env.PORT || 10000;
const PUBLIC_URL = "https://aifucito5-0.onrender.com";

const FECHA_CORTE_VIP = new Date("2026-03-14T00:00:00").getTime();

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
    admins_centrales: [742615432,8701174108]
};

let BRAIN = {
    vocabulario:{
        hola:"¡Hola agente!",
        ovni:"Los ovnis están siendo investigados.",
        radar:"El radar registra actividad aérea anómala."
    },
    desconocido:[]
};

// ==================================================================================
// SISTEMA DE ARCHIVOS
// ==================================================================================

function registrarLog(msg){

const entry = `[${new Date().toLocaleString()}] ${msg}\n`;

fs.appendFileSync(LOG_PATH,entry);

console.log(entry);

}

function inicializarBases(){

try{

if(fs.existsSync(DB_PATH))
DB = JSON.parse(fs.readFileSync(DB_PATH,"utf8"));

if(fs.existsSync(BRAIN_PATH))
BRAIN = JSON.parse(fs.readFileSync(BRAIN_PATH,"utf8"));

registrarLog("BASES CARGADAS");

}catch(e){

registrarLog("ERROR CARGANDO BASES");

}

}

function guardarTodo(){

fs.writeFileSync(DB_PATH,JSON.stringify(DB,null,4));

fs.writeFileSync(BRAIN_PATH,JSON.stringify(BRAIN,null,4));

}

inicializarBases();

// ==================================================================================
// VALIDACIÓN VIP
// ==================================================================================

function verificarVIP(id){

const ahora = Date.now();

if(DB.admins_centrales.includes(id)) return true;

if(DB.agentes[id]?.vip_pago) return true;

if(ahora < FECHA_CORTE_VIP) return true;

return false;

}

// ==================================================================================
// BOT
// ==================================================================================

const bot = new Telegraf(TOKEN);

bot.use(session());

/*
====================================================
PROTECCIÓN DE SESIÓN
SOLUCIONA EL ERROR escribiendo_historia
====================================================
*/

bot.use((ctx,next)=>{

if(!ctx.session){
ctx.session={}
}

if(ctx.session.reporte===undefined)
ctx.session.reporte=null

if(ctx.session.chateando===undefined)
ctx.session.chateando=false

if(ctx.session.escribiendo_historia===undefined)
ctx.session.escribiendo_historia=false

if(ctx.session.aprendiendo_de_vos===undefined)
ctx.session.aprendiendo_de_vos=false

return next()

})

// ==================================================================================
// MENÚ
// ==================================================================================

function menuPrincipal(ctx){

const vip = verificarVIP(ctx.from.id)

let botones=[
["🛸 REPORTAR AVISTAMIENTO","🌍 MAPA GLOBAL"],
["🤖 CHARLAR CON AIFUCITO","⭐ MI PERFIL"]
]

if(vip){
botones.push(["📚 HISTORIAS VIP"])
}

return Markup.keyboard(botones).resize()

}

// ==================================================================================
// START
// ==================================================================================

bot.start(ctx=>{

const id=ctx.from.id

if(!DB.agentes[id]){

DB.agentes[id]={
id:id,
nombre:ctx.from.first_name,
vip_pago:false,
reportes_totales:0,
xp:100,
fecha_registro:new Date().toISOString()
}

guardarTodo()

}

ctx.reply(
"SISTEMA AIFUCITO ONLINE",
menuPrincipal(ctx)
)

})

// ==================================================================================
// PERFIL
// ==================================================================================

bot.hears("⭐ MI PERFIL",(ctx)=>{

const u=DB.agentes[ctx.from.id]

if(!u) return

const vip = verificarVIP(ctx.from.id)

ctx.reply(`
AGENTE: ${u.nombre}

VIP: ${vip}

REPORTES: ${u.reportes_totales}

XP: ${u.xp}
`)

})

// ==================================================================================
// MAPA
// ==================================================================================

bot.hears("🌍 MAPA GLOBAL",(ctx)=>{

const uid=ctx.from.id

ctx.reply(`Radar:
${PUBLIC_URL}/radar?uid=${uid}`)

})

// ==================================================================================
// CHAT IA
// ==================================================================================

bot.hears("🤖 CHARLAR CON AIFUCITO",(ctx)=>{

ctx.session.chateando=true

ctx.reply("Modo charla activo. Escribe SALIR para terminar.")

})

// ==================================================================================
// HISTORIAS VIP
// ==================================================================================

bot.hears("📚 HISTORIAS VIP",(ctx)=>{

if(!verificarVIP(ctx.from.id))
return ctx.reply("Acceso VIP requerido")

ctx.reply(
"Panel historias",
Markup.inlineKeyboard([
[Markup.button.callback("Leer","ver_blog")],
[Markup.button.callback("Escribir","escribir_blog")]
])
)

})

bot.action("ver_blog",(ctx)=>{

if(DB.historias.length===0)
return ctx.reply("Sin historias")

let texto="HISTORIAS\n\n"

DB.historias.slice(-5).forEach(h=>{

texto+=`${h.autor}\n${h.texto}\n\n`

})

ctx.reply(texto)

})

bot.action("escribir_blog",(ctx)=>{

ctx.session.escribiendo_historia=true

ctx.reply("Escribe tu historia")

})

// ==================================================================================
// REPORTES
// ==================================================================================

bot.hears("🛸 REPORTAR AVISTAMIENTO",(ctx)=>{

ctx.session.reporte={
paso:"tipo"
}

ctx.reply("¿Tipo de objeto?")

})

// ==================================================================================
// MOTOR TEXTO
// ==================================================================================

bot.on("text",async(ctx)=>{

const txt=ctx.message.text

// cancelar

if(txt==="SALIR"){

ctx.session.reporte=null
ctx.session.chateando=false
ctx.session.escribiendo_historia=false

return ctx.reply("Operación cancelada",menuPrincipal(ctx))

}

// escribir historia

if(ctx.session.escribiendo_historia){

DB.historias.push({

autor:ctx.from.first_name,
texto:txt,
fecha:new Date().toLocaleDateString()

})

guardarTodo()

ctx.session.escribiendo_historia=false

return ctx.reply("Historia guardada",menuPrincipal(ctx))

}

// chat

if(ctx.session.chateando){

const msg=txt.toLowerCase()

for(const palabra in BRAIN.vocabulario){

if(msg.includes(palabra))
return ctx.reply(BRAIN.vocabulario[palabra])

}

ctx.session.aprendiendo_de_vos=msg

return ctx.reply("No entiendo. Explica.")

}

})

// ==================================================================================
// EXPRESS SERVER
// ==================================================================================

const app = express()

app.get("/",(req,res)=>{

res.send("AIFUCITO ONLINE")

})

app.get("/radar",(req,res)=>{

const uid=parseInt(req.query.uid)

const vip=verificarVIP(uid)

let datos = vip
? DB.reportes
: DB.reportes.filter(r=>r.id_agente===uid)

res.json(datos)

})

// ==================================================================================
// ARRANQUE
// ==================================================================================

bot.launch()

app.listen(PORT,()=>{

registrarLog(`🛰️ NODO AIFUCITO ONLINE EN ${PORT}`)

})
