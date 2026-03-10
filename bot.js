import { Telegraf, Markup } from 'telegraf'
import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import fetch from 'node-fetch'
import 'dotenv/config'

/* =========================
   RUTAS BASE
========================= */

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/* =========================
   SERVIDOR WEB (RADAR)
========================= */

const app = express()
const PORT = process.env.PORT || 3000

// Variable para guardar la dirección real del mapa
let MI_URL_ACTUAL = "https://aifucito5-0.onrender.com"; 

/* =========================
   ALMACENAMIENTO
========================= */

const DATA_DIR = '/data'
let DB_FILE
let MAP_FILE

if (fs.existsSync(DATA_DIR)) {
  console.log('DISCO PERSISTENTE DETECTADO (/data)')
  DB_FILE = path.join(DATA_DIR, 'base_datos_aifu.json')
  MAP_FILE = path.join(DATA_DIR, 'reportes.json')
} else {
  console.log('ALMACENAMIENTO LOCAL TEMPORAL')
  DB_FILE = path.join(__dirname, 'base_datos_aifu.json')
  MAP_FILE = path.join(__dirname, 'reportes.json')
}

/* =========================
   INICIALIZAR ARCHIVOS
========================= */

if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ usuarios: {} }, null, 2))
}

if (!fs.existsSync(MAP_FILE)) {
  fs.writeFileSync(MAP_FILE, JSON.stringify([], null, 2))
}

let db
try {
  db = JSON.parse(fs.readFileSync(DB_FILE))
} catch {
  db = { usuarios: {} }
}

function guardarDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2))
}

function guardarReporteMapa(reporte) {
  let data
  try {
    data = JSON.parse(fs.readFileSync(MAP_FILE))
  } catch {
    data = []
  }
  data.push(reporte)
  fs.writeFileSync(MAP_FILE, JSON.stringify(data, null, 2))
}

/* =========================
   GEOLOCALIZACIÓN
========================= */

async function geolocalizacionInversa(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=es`
    const res = await fetch(url,{
      headers:{ "User-Agent":"AIFU-Radar" }
    })
    const data = await res.json()
    return {
      pais: data.address?.country || "",
      ciudad: data.address?.city || data.address?.town || data.address?.village || "",
      barrio: data.address?.suburb || data.address?.neighbourhood || ""
    }
  } catch {
    return { pais:"", ciudad:"", barrio:"" }
  }
}

async function geocodificarLugar(pais, ciudad, barrio) {
  try {
    const query = encodeURIComponent(`${barrio} ${ciudad} ${pais}`)
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&accept-language=es`
    const res = await fetch(url,{
      headers:{ "User-Agent":"AIFU-Radar" }
    })
    const data = await res.json()
    if (data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon)
      }
    }
    return { lat:null, lng:null }
  } catch {
    return { lat:null, lng:null }
  }
}

/* =========================
   SERVIDOR RADAR
========================= */

app.use(express.static(path.join(__dirname,'public')))

app.get('/',(req,res)=>{
  res.sendFile(path.join(__dirname,'public','index.html'))
})

app.get('/reportes.json',(req,res)=>{
  res.sendFile(MAP_FILE)
})

// Esta parte intenta detectar la URL real donde estás alojado
app.listen(PORT,'0.0.0.0',()=>{
  console.log("RADAR AIFU ACTIVO EN PUERTO "+PORT)
})

/* =========================
   BOT TELEGRAM
========================= */

const bot = new Telegraf(process.env.TELEGRAM_TOKEN)
let sesiones = {}

const CANALES = {
  Uruguay:"-1003826671445",
  Argentina:"-1003750025728",
  Chile:"-1003811532520",
  GLOBAL:"-1003759731798"
}

function menuPrincipal(){
  return Markup.keyboard([
    ['🛸 Reportar Avistamiento','🗺️ Ver Mapa'],
    ['🎖️ Mi Perfil Investigador','🔗 Canales AIFU'],
    ['ℹ️ Sobre AIFU']
  ]).resize()
}

bot.start(ctx=>{
  const id = ctx.from.id
  if(!db.usuarios[id]){
    db.usuarios[id]={
      nombre:ctx.from.first_name,
      puntos:0,
      reportes:0
    }
    guardarDB()
  }
  ctx.reply(`🛸 SISTEMA DE REPORTES AIFU\n\nPuedes reportar avistamientos que aparecerán en el radar.`, menuPrincipal())
})

/* =========================
   VER MAPA (CORREGIDO)
========================= */

bot.hears('🗺️ Ver Mapa', ctx => {
  // Intentamos usar la URL de Render si existe, sino la fija
  const urlFinal = process.env.RENDER_EXTERNAL_URL || MI_URL_ACTUAL;

  ctx.reply(
    "🛰️ RADAR AIFU ACTIVO\nPulsa el botón para ver los avistamientos en tiempo real:",
    Markup.inlineKeyboard([
      Markup.button.url("🌐 Abrir Mapa en el Navegador", urlFinal)
    ])
  )
})

/* =========================
   EL RESTO DEL CÓDIGO SE MANTIENE IGUAL
========================= */

bot.hears('🔗 Canales AIFU',ctx=>{
  ctx.reply(`RED DE INVESTIGACIÓN AIFU\n\n🇺🇾 Uruguay\nhttps://t.me/+XXXXXXXX\n\n🇦🇷 Argentina\nhttps://t.me/+XXXXXXXX\n\n🇨🇱 Chile\nhttps://t.me/+XXXXXXXX\n\n🌎 AIFU GLOBAL\nhttps://t.me/+r5XfcJma3g03MWZh`)
})

bot.hears('🎖️ Mi Perfil Investigador',ctx=>{
  const user=db.usuarios[ctx.from.id]
  if(!user) return
  ctx.reply(`👤 PERFIL INVESTIGADOR\n\nNombre: ${user.nombre}\nReportes enviados: ${user.reportes}\nPuntos AIFU: ${user.puntos}`)
})

bot.hears('ℹ️ Sobre AIFU',ctx=>{
  ctx.reply(`AIFU\n\nSistema de investigación y registro de avistamientos.\n\nLos reportes se geolocalizan y aparecen en el radar público.`)
})

bot.hears('🛸 Reportar Avistamiento',ctx=>{
  sesiones[ctx.from.id]={
    paso:"pais",
    datos:{ pais:"", ciudad:"", barrio:"", descripcion:"", lat:null, lng:null, fotos:[] }
  }
  ctx.reply("¿En qué país ocurrió el avistamiento?", Markup.keyboard([
    ['Uruguay','Argentina','Chile'],
    ['Otro país'],
    ['❌ Cancelar']
  ]).resize())
})

bot.on(['text','location','photo'],async ctx=>{
  const id=ctx.from.id
  const s=sesiones[id]
  if(!s) return
  const txt=ctx.message.text
  if(txt==='❌ Cancelar'){
    delete sesiones[id]
    return ctx.reply("Reporte cancelado.",menuPrincipal())
  }
  if(s.paso==="pais"){
    s.datos.pais=txt
    s.paso="ciudad"
    return ctx.reply("Ciudad del avistamiento:")
  }
  if(s.paso==="ciudad"){
    s.datos.ciudad=txt
    s.paso="barrio"
    return ctx.reply("Barrio o zona:")
  }
  if(s.paso==="barrio"){
    s.datos.barrio=txt
    s.paso="ubicacion"
    return ctx.reply("Podés enviar GPS o continuar.", Markup.keyboard([
      [Markup.button.locationRequest('📍 Enviar GPS')],
      ['Continuar sin GPS'],
      ['❌ Cancelar']
    ]).resize())
  }
  if(ctx.message.location && s.paso==="ubicacion"){
    s.datos.lat=ctx.message.location.latitude
    s.datos.lng=ctx.message.location.longitude
    const geo=await geolocalizacionInversa(s.datos.lat,s.datos.lng)
    if(geo.pais) s.datos.pais=geo.pais
    if(geo.ciudad) s.datos.ciudad=geo.ciudad
    if(geo.barrio) s.datos.barrio=geo.barrio
    s.paso="descripcion"
    return ctx.reply(`Ubicación detectada\n\nPaís: ${s.datos.pais}\nCiudad: ${s.datos.ciudad}\nZona: ${s.datos.barrio}\n\nDescribe lo que viste:`)
  }
  if(txt==="Continuar sin GPS" && s.paso==="ubicacion"){
    s.paso="descripcion"
    return ctx.reply("Describe lo que viste:")
  }
  if(s.paso==="descripcion"){
    if(s.datos.lat===null || s.datos.lng===null){
      const coords=await geocodificarLugar(s.datos.pais, s.datos.ciudad, s.datos.barrio)
      s.datos.lat=coords.lat
      s.datos.lng=coords.lng
    }
    s.datos.descripcion=txt
    s.paso="fotos"
    return ctx.reply("Podés enviar fotos o finalizar.", Markup.keyboard([
      ['🚀 Finalizar reporte'],
      ['❌ Cancelar']
    ]).resize())
  }
  if(ctx.message.photo && s.paso==="fotos"){
    const file=ctx.message.photo[ctx.message.photo.length-1].file_id
    s.datos.fotos.push(file)
    return ctx.reply("Foto agregada.")
  }
  if(txt==="🚀 Finalizar reporte"){
    await publicarReporte(ctx,s.datos)
    delete sesiones[id]
  }
})

async function publicarReporte(ctx,datos){
  const ficha=`🛸 REPORTE AIFU\n\nPaís: ${datos.pais}\nCiudad: ${datos.ciudad}\nZona: ${datos.barrio}\n\nDescripción:\n${datos.descripcion}`
  const canal=CANALES[datos.pais] || CANALES.GLOBAL
  try{
    for(const f of datos.fotos){
      await bot.telegram.sendPhoto(canal,f)
    }
    await bot.telegram.sendMessage(canal,ficha)
    if(canal!==CANALES.GLOBAL){
      await bot.telegram.sendMessage(CANALES.GLOBAL,ficha)
    }
    const reporteMapa={
      pais:datos.pais, ciudad:datos.ciudad, barrio:datos.barrio,
      descripcion:datos.descripcion, lat:datos.lat, lng:datos.lng, fecha:new Date()
    }
    guardarReporteMapa(reporteMapa)
    const user=db.usuarios[ctx.from.id]
    user.puntos+=10
    user.reportes+=1
    guardarDB()
    ctx.reply("Reporte enviado correctamente.",menuPrincipal())
  }catch(err){
    console.log(err)
    ctx.reply("Error al publicar el reporte.")
  }
}

bot.launch().then(()=>{
  console.log("BOT AIFU ACTIVO")
})

process.once('SIGINT',()=>bot.stop('SIGINT'))
process.once('SIGTERM',()=>bot.stop('SIGTERM'))
