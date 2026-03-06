/**
 * ==================================================================================
 * 🛰️ AIFUCITO 5.0 - NODO CENTRAL ESTABLE
 * ==================================================================================
 * BOT TELEGRAM + SERVIDOR WEB RADAR
 * Compatible con Render
 * ==================================================================================
 */

import { Telegraf, Markup, session } from "telegraf"
import express from "express"
import fs from "fs"
import crypto from "crypto"

const fsPromises = fs.promises

// ==================================================================================
// CONFIG
// ==================================================================================

const TOKEN = process.env.BOT_TOKEN
const PORT = process.env.PORT || 10000

const PUBLIC_URL = "https://aifucito5-0.onrender.com"

const CANAL_CENTRAL = "-1002388657640"

const CANALES_REGIONALES = {
    URUGUAY: "-1002347230353",
    ARGENTINA: "-1002410312674",
    CHILE: "-1002283925519",
    OTROS: "-1002414775486"
}

// ==================================================================================
// BASE DE DATOS
// ==================================================================================

const DB_PATH = "./aifucito_db.json"
const BRAIN_PATH = "./brain.json"

let DB = {
    agentes: {},
    reportes: [],
    historias: [],
    admins: [742615432]
}

let BRAIN = {
    vocabulario: {
        hola: "Saludos agente. Sistema AIFUCITO operativo.",
        ovni: "Los OVNIs (UAP) son objetos aéreos no identificados con maniobras imposibles.",
        nasa: "La NASA es la agencia espacial civil de Estados Unidos.",
        luna: "La Luna presenta anomalías geológicas y resonancia inusual.",
        area51: "Área 51 es una instalación militar en Nevada.",
        roswell: "Roswell 1947 es el caso OVNI más famoso del siglo XX.",
        grises: "Los grises son entidades reportadas en múltiples encuentros cercanos."
    }
}

// ==================================================================================
// SISTEMA ARCHIVOS
// ==================================================================================

function log(msg){

    const texto = `[${new Date().toLocaleString()}] ${msg}\n`

    fs.appendFileSync("logs.txt",texto)

    console.log(texto)

}

function cargarBases(){

    try{

        if(fs.existsSync(DB_PATH)){

            DB = JSON.parse(fs.readFileSync(DB_PATH,"utf8"))

        }

        if(fs.existsSync(BRAIN_PATH)){

            BRAIN = JSON.parse(fs.readFileSync(BRAIN_PATH,"utf8"))

        }

        log("BASES CARGADAS")

    }catch(e){

        log("ERROR CARGANDO BASES")

    }

}

async function guardarTodo(){

    try{

        await fsPromises.writeFile(DB_PATH,JSON.stringify(DB,null,4))

        await fsPromises.writeFile(BRAIN_PATH,JSON.stringify(BRAIN,null,4))

    }catch(e){

        log("ERROR GUARDANDO")

    }

}

cargarBases()

// ==================================================================================
// BOT
// ==================================================================================

const bot = new Telegraf(TOKEN)

bot.use(session())

bot.use((ctx,next)=>{

    if(!ctx.session) ctx.session = {}

    if(ctx.session.reporte === undefined) ctx.session.reporte = null

    if(ctx.session.chat === undefined) ctx.session.chat = false

    if(ctx.session.historia === undefined) ctx.session.historia = false

    return next()

})

// ==================================================================================
// MENU
// ==================================================================================

function menuPrincipal(){

    return Markup.keyboard([
        ["🛸 REPORTAR AVISTAMIENTO","🌍 MAPA GLOBAL"],
        ["🤖 CHARLAR CON AIFUCITO","⭐ MI PERFIL"],
        ["📚 HISTORIAS"]
    ]).resize()

}

// ==================================================================================
// START
// ==================================================================================

bot.start(async ctx=>{

    const id = ctx.from.id

    if(!DB.agentes[id]){

        DB.agentes[id] = {

            id:id,
            nombre:ctx.from.first_name,
            xp:100,
            reportes:0,
            fecha:new Date().toISOString()

        }

        await guardarTodo()

    }

    ctx.reply(
        "🛰️ SISTEMA AIFUCITO 5.0 ONLINE\n\nRed global de investigación OVNI activa.",
        menuPrincipal()
    )

})

// ==================================================================================
// TEXTO
// ==================================================================================

bot.on("text",async ctx=>{

    const txt = ctx.message.text

    const id = ctx.from.id

// SALIR

    if(txt === "SALIR"){

        ctx.session.reporte = null
        ctx.session.chat = false
        ctx.session.historia = false

        return ctx.reply("Volviendo al menú",menuPrincipal())

    }

// REPORTE

    if(ctx.session.reporte){

        if(ctx.session.reporte.paso === "tipo"){

            ctx.session.reporte.tipo = txt

            ctx.session.reporte.paso = "ubicacion"

            return ctx.reply("Indica ciudad o ubicación")

        }

        if(ctx.session.reporte.paso === "ubicacion"){

            const idr = crypto.randomBytes(3).toString("hex")

            const rep = {

                id:idr,
                agente:ctx.from.first_name,
                tipo:ctx.session.reporte.tipo,
                ubicacion:txt,
                fecha:new Date().toLocaleString()

            }

            DB.reportes.push(rep)

            DB.agentes[id].reportes++

            DB.agentes[id].xp += 50

            await guardarTodo()

            ctx.session.reporte = null

            try{

                await ctx.telegram.sendMessage(
                    CANAL_CENTRAL,
                    `🛸 NUEVO REPORTE\n\nAgente: ${rep.agente}\nTipo:${rep.tipo}\nUbicación:${rep.ubicacion}`
                )

            }catch(e){

                log("Error enviando reporte")

            }

            return ctx.reply(`Reporte guardado ID:${idr}`,menuPrincipal())

        }

    }

// HISTORIAS

    if(ctx.session.historia){

        DB.historias.push({

            autor:ctx.from.first_name,
            texto:txt,
            fecha:new Date().toLocaleDateString()

        })

        await guardarTodo()

        ctx.session.historia = false

        return ctx.reply("Historia guardada",menuPrincipal())

    }

// CHAT IA

    if(ctx.session.chat){

        const m = txt.toLowerCase()

        for(const clave in BRAIN.vocabulario){

            if(m.includes(clave)){

                return ctx.reply(BRAIN.vocabulario[clave])

            }

        }

        return ctx.reply("No tengo información sobre eso.")

    }

})

// ==================================================================================
// BOTONES
// ==================================================================================

bot.hears("🛸 REPORTAR AVISTAMIENTO",ctx=>{

    ctx.session.reporte = { paso:"tipo" }

    ctx.reply("Describe el objeto observado")

})

bot.hears("🌍 MAPA GLOBAL",ctx=>{

    ctx.reply(`${PUBLIC_URL}/radar`)

})

bot.hears("⭐ MI PERFIL",ctx=>{

    const u = DB.agentes[ctx.from.id]

    ctx.reply(

`AGENTE

Nombre: ${u.nombre}
Reportes: ${u.reportes}
XP: ${u.xp}`

)

})

bot.hears("🤖 CHARLAR CON AIFUCITO",ctx=>{

    ctx.session.chat = true

    ctx.reply("Modo conversación activo.")

})

bot.hears("📚 HISTORIAS",ctx=>{

    ctx.reply(

        "Biblioteca",

        Markup.inlineKeyboard([
            [Markup.button.callback("Leer","leer")],
            [Markup.button.callback("Escribir","escribir")]
        ])

    )

})

// ==================================================================================
// ACCIONES
// ==================================================================================

bot.action("leer",ctx=>{

    if(DB.historias.length === 0){

        return ctx.reply("No hay historias")

    }

    let t = "Historias recientes\n\n"

    DB.historias.slice(-5).forEach(h=>{

        t += `"${h.texto}"\nAutor:${h.autor}\n\n`

    })

    ctx.reply(t)

})

bot.action("escribir",ctx=>{

    ctx.session.historia = true

    ctx.reply("Escribe tu historia")

})

// ==================================================================================
// SERVIDOR WEB
// ==================================================================================

const app = express()

app.get("/",(req,res)=>{

    res.send("AIFUCITO ONLINE")

})

app.get("/radar",(req,res)=>{

    res.json(DB.reportes)

})

// ==================================================================================
// LANZAMIENTO
// ==================================================================================

bot.launch()

app.listen(PORT,()=>{

    log("Servidor iniciado")

})

process.on("unhandledRejection",err=>{

    log("ERROR:"+err)

})
