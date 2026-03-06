// bot.js
import { Telegraf, Markup } from 'telegraf'
import fs from 'fs'
import path from 'path'
import express from 'express'
import cors from 'cors'
import { obtenerCoordenadas } from './utils/ubicacion.js'
import { detectarCategoria } from './utils/categorias.js'

// ---------- CONFIG ----------
const BOT_TOKEN = process.env.BOT_TOKEN || '8701174108:AAFgEE-uSZlDvrTNm_QIeDIINqmnCzQIOCM'
const ADMIN_ID = 123456789
const CANALES = { radar: '@aifu_radar', uy: '@aifu_uy', ar: '@aifu_ar', cl: '@aifu_cl' }
const URL_MAPA = 'https://aifucito5-0.onrender.com/index.html'

// ---------- EXPRESS ----------
const app = express()
app.use(cors())
app.use(express.static('public'))

let reportes = []
let usuarios = []

app.get('/reportes.json', (req, res) => res.json(reportes))
app.get('/usuarios.json', (req, res) => res.json(usuarios))

// mapa filtrado por usuario
app.get('/mapa-data', (req, res) => {
  const userId = parseInt(req.query.user)

  const user = usuarios.find(u => u.id === userId)

  if (!user) return res.json([])

  if (user.vip) {
    return res.json(reportes)
  }

  const propios = reportes.filter(r => r.usuario === userId)
  res.json(propios)
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Servidor Express activo en puerto ${PORT}`))

// ---------- DATA ----------
const dataDir = path.join('./data')
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir)

const usuariosFile = path.join(dataDir, 'usuarios.json')
const reportesFile = path.join(dataDir, 'reportes.json')

if (fs.existsSync(usuariosFile)) {
  usuarios = JSON.parse(fs.readFileSync(usuariosFile))
}

if (fs.existsSync(reportesFile)) {
  reportes = JSON.parse(fs.readFileSync(reportesFile))
}

function guardarDatos() {
  fs.writeFileSync(usuariosFile, JSON.stringify(usuarios, null, 2))
  fs.writeFileSync(reportesFile, JSON.stringify(reportes, null, 2))
}

// ---------- REGISTRO AUTOMÁTICO ----------
function registrarUsuario(id) {

  let u = usuarios.find(x => x.id === id)

  if (!u) {

    const ahora = new Date()

    const esVIPTemporal = ahora < FECHA_LIMITE_VIP_PRUEBA

    usuarios.push({
      id: id,
      vip: esVIPTemporal,
      fechaRegistro: ahora.toISOString(),
      fechaInicio: ahora.toISOString(),
      fechaRenovacion: esVIPTemporal ? "2099-01-01" : null
    })

    guardarDatos()
  }
}

// ---------- VIP ----------
const FECHA_LIMITE_VIP_PRUEBA = new Date('2026-03-11T18:00:00')

function esVIP(userId) {

  const user = usuarios.find(u => u.id === userId)

  if (!user) return false

  if (!user.vip) return false

  if (!user.fechaRenovacion) return false

  const hoy = new Date()
  const vence = new Date(user.fechaRenovacion)

  if (hoy > vence) {
    user.vip = false
    guardarDatos()
    return false
  }

  return true
}

function activarVIP(userId, metodo = 'manual') {

  const hoy = new Date()

  const vence = new Date()
  vence.setMonth(vence.getMonth() + 1)

  let user = usuarios.find(u => u.id === userId)

  if (!user) {
    user = { id: userId }
    usuarios.push(user)
  }

  user.vip = true
  user.metodoPago = metodo
  user.fechaInicio = hoy.toISOString()
  user.fechaRenovacion = vence.toISOString()

  guardarDatos()
}

// ---------- BOT ----------
const bot = new Telegraf(BOT_TOKEN)

// ---------- MENÚ ----------
function menuPrincipal() {
  return Markup.keyboard([
    ['Reportar', 'Ver Mapa'],
    ['Red AIFU', 'Mi estado'],
    ['Quiénes somos'],
    ['Charlar con AIFUCITO']
  ]).resize()
}

bot.start(ctx => {

  registrarUsuario(ctx.from.id)

  ctx.reply(
`👽 ¡Hola explorador! Soy AIFUCITO 🤖
Tu asistente de la red AIFU.

Estoy listo para registrar fenómenos y misterios.

Selecciona una opción:`,
    menuPrincipal()
  )
})

// ---------- RED AIFU ----------
bot.hears('Red AIFU', ctx => {

  ctx.reply(
"🌎 Canales oficiales de la red AIFU",
    Markup.inlineKeyboard([
      [Markup.button.url("Radar Cono Sur", "https://t.me/+YqA6d3VpKv9mZjU5")],
      [Markup.button.url("AIFU Uruguay", "https://t.me/+nCVD4NsOihIyNGFh")],
      [Markup.button.url("AIFU Argentina", "https://t.me/+QpErPk26SY05OGIx")],
      [Markup.button.url("AIFU Chile", "https://t.me/+VP2T47eLvIowNmYx")],
      [Markup.button.url("AIFU Global", "https://t.me/+r5XfcJma3g03MWZh")]
    ])
  )

})

// ---------- MAPA ----------
bot.hears('Ver Mapa', ctx => {

  const id = ctx.from.id

  ctx.reply(`🌍 Mapa interactivo AIFU

${URL_MAPA}?user=${id}`)

})

// ---------- ESTADO ----------
bot.hears('Mi estado', ctx => {

  const id = ctx.from.id
  const user = usuarios.find(u => u.id === id)

  if (user && user.vip) {
    ctx.reply(`⭐ VIP activo

Renovación: ${user.fechaRenovacion}`)
  } else {
    ctx.reply("Cuenta estándar activa.")
  }

})

// ---------- QUIENES SOMOS ----------
bot.hears('Quiénes somos', ctx => {

  ctx.reply(`👽 AIFU

Avistamiento e Investigación de Fenómenos Uruguayos

Red dedicada a registrar fenómenos anómalos y actividad aérea inexplicada.`)

})

// ---------- REPORTE ----------
let sesiones = {}

bot.hears('Reportar', ctx => {

  registrarUsuario(ctx.from.id)

  sesiones[ctx.from.id] = { estado: 'inicio' }

  ctx.reply(
`📍 Envíame tu ubicación GPS o selecciona "No tengo GPS"`,
    Markup.keyboard([
      [Markup.button.locationRequest('Enviar ubicación GPS')],
      ['No tengo GPS']
    ]).resize()
  )

})

// ubicación
bot.on('location', ctx => {

  const id = ctx.from.id

  if (!sesiones[id]) return

  const sesion = sesiones[id]

  if (sesion.estado === 'inicio') {

    sesion.lat = ctx.message.location.latitude
    sesion.lng = ctx.message.location.longitude
    sesion.estado = 'pais'

    ctx.reply("Indica tu país")

  }

})

// ---------- TEXTO ----------
bot.on('text', async ctx => {

  const id = ctx.from.id
  const texto = ctx.message.text

  if (!sesiones[id]) return

  const sesion = sesiones[id]

  if (sesion.estado === 'inicio' && texto === 'No tengo GPS') {

    sesion.estado = 'pais'
    ctx.reply("Indica tu país")
    return
  }

  if (sesion.estado === 'pais') {
    sesion.pais = texto
    sesion.estado = 'ciudad'
    ctx.reply("Ciudad")
    return
  }

  if (sesion.estado === 'ciudad') {
    sesion.ciudad = texto
    sesion.estado = 'barrio'
    ctx.reply("Barrio o zona")
    return
  }

  if (sesion.estado === 'barrio') {
    sesion.barrio = texto
    sesion.estado = 'descripcion'
    ctx.reply("Describe el fenómeno")
    return
  }

  if (sesion.estado === 'descripcion') {

    sesion.mensaje = texto
    sesion.categoria = detectarCategoria(texto)

    await finalizarReporte(ctx, sesion)

    delete sesiones[id]

  }

})

// ---------- FINALIZAR ----------
async function finalizarReporte(ctx, sesion) {

  const id = ctx.from.id

  const coords = sesion.lat && sesion.lng
    ? { lat: sesion.lat, lng: sesion.lng }
    : await obtenerCoordenadas(`${sesion.pais}, ${sesion.ciudad}, ${sesion.barrio}`)

  const nuevoReporte = {

    id: Date.now(),
    usuario: id,
    fecha: new Date().toISOString(),
    pais: sesion.pais,
    ciudad: sesion.ciudad,
    barrio: sesion.barrio,
    mensaje: sesion.mensaje,
    categoria: sesion.categoria,
    lat: coords?.lat || null,
    lng: coords?.lng || null,
    multimedia: [],
    vip: esVIP(id)

  }

  reportes.push(nuevoReporte)

  guardarDatos()

  await publicarReporte(nuevoReporte)

  ctx.reply("✅ Reporte registrado por AIFUCITO", menuPrincipal())

}

// ---------- PUBLICAR ----------
async function publicarReporte(reporte) {

  let texto = `📡 REPORTE AIFU

${reporte.pais} - ${reporte.ciudad}

Categoría: ${reporte.categoria}

${reporte.mensaje}`

  try {
    await bot.telegram.sendMessage(CANALES.radar, texto)
  } catch (e) {
    console.error(e)
  }

}

// ---------- CHAT AIFUCITO ----------
let sesionesChat = {}

bot.hears('Charlar con AIFUCITO', ctx => {

  sesionesChat[ctx.from.id] = { activa: true }

  ctx.reply(
"👽 Soy AIFUCITO.\nPuedes hablar conmigo sobre fenómenos extraños.",
    Markup.keyboard([
      ['Terminar charla'],
      ['Menú principal']
    ]).resize()
  )

})

bot.hears('Terminar charla', ctx => {

  delete sesionesChat[ctx.from.id]

  ctx.reply("AIFUCITO vuelve al radar.", menuPrincipal())

})

// ---------- ADMIN ----------
bot.command('activarvip', ctx => {

  if (ctx.from.id !== ADMIN_ID) return

  const [cmd, id] = ctx.message.text.split(' ')

  activarVIP(parseInt(id))

  ctx.reply("VIP activado")

})

bot.command('panel', ctx => {

  if (ctx.from.id !== ADMIN_ID) return

  ctx.reply(`Usuarios: ${usuarios.length}
Reportes: ${reportes.length}`)

})

// ---------- START ----------
bot.launch().then(() => console.log("AIFUCITO 5.0 activo"))

// ---------- ERRORES ----------
bot.catch(err => console.error(err))
process.on('unhandledRejection', console.error)
process.on('uncaughtException', console.error)
