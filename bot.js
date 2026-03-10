import { Telegraf, Markup } from 'telegraf'
import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import fetch from 'node-fetch'
import 'dotenv/config'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/* =========================
   SERVIDOR WEB (RADAR)
========================= */
const app = express()
const PORT = process.env.PORT || 3000

/* =========================
   ALMACENAMIENTO PERSISTENTE
========================= */
const DATA_DIR = '/data'
let DB_FILE = path.join(DATA_DIR, 'base_datos_aifu.json')
let MAP_FILE = path.join(DATA_DIR, 'reportes.json')

if (!fs.existsSync(DATA_DIR)) {
  console.log('⚠️ MODO LOCAL: No se detectó /data')
  DB_FILE = path.join(__dirname, 'base_datos_aifu.json')
  MAP_FILE = path.join(__dirname, 'reportes.json')
}

// Inicializar archivos si no existen
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ usuarios: {} }, null, 2))
if (!fs.existsSync(MAP_FILE)) fs.writeFileSync(MAP_FILE, JSON.stringify([], null, 2))

let db = JSON.parse(fs.readFileSync(DB_FILE))
const guardarDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2))

const guardarReporteMapa = (reporte) => {
  let data = JSON.parse(fs.readFileSync(MAP_FILE))
  data.push({ ...reporte, id: Date.now(), fecha: new Date().toISOString() })
  fs.writeFileSync(MAP_FILE, JSON.stringify(data, null, 2))
}

/* =========================
   GEOLOCALIZACIÓN (Nominatim)
========================= */
async function geolocalizacionInversa(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
    const res = await fetch(url, { headers: { "User-Agent": "AIFU-Radar" } })
    const data = await res.json()
    return {
      pais: data.address?.country || "Uruguay",
      ciudad: data.address?.city || data.address?.town || "Desconocida",
      barrio: data.address?.suburb || data.address?.neighbourhood || "Sin zona"
    }
  } catch { return { pais: "Uruguay", ciudad: "GPS", barrio: "Coordenadas" } }
}

/* =========================
   CONFIGURACIÓN DEL SERVIDOR
========================= */
app.use(express.static(path.join(__dirname, 'public')))
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')))
app.get('/reportes.json', (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.sendFile(MAP_FILE)
})
app.listen(PORT, '0.0.0.0', () => console.log("🚀 RADAR ACTIVO EN PUERTO " + PORT))

/* =========================
   BOT TELEGRAM (AIFUCITO)
========================= */
const bot = new Telegraf(process.env.TELEGRAM_TOKEN)
let sesiones = {}

// IDs de los canales donde el bot es ADMIN
const CANALES = {
  Uruguay: "-1003826671445",
  Argentina: "-1003750025728",
  Chile: "-1003811532520",
  GLOBAL: "-1003820597313",
  CENTRAL: "-1003759731798"
}

const menuPrincipal = () => Markup.keyboard([
  ['🛸 Reportar Avistamiento', '🗺️ Ver Mapa'],
  ['🎖️ Mi Perfil Investigador', '🔗 Canales AIFU'],
  ['ℹ️ Sobre AIFU']
]).resize()

bot.start(ctx => {
  const id = ctx.from.id
  if (!db.usuarios[id]) {
    db.usuarios[id] = { nombre: ctx.from.first_name, puntos: 0, reportes: 0 }
    guardarDB()
  }
  ctx.reply(`🛸 SISTEMA AIFU URUGUAY ACTIVO\nInvestigador ${ctx.from.first_name}, reporte cualquier anomalía.`, menuPrincipal())
})

bot.hears('🗺️ Ver Mapa', ctx => {
  ctx.reply(`🛰️ RADAR TÁCTICO EN VIVO:\nhttps://aifucito5-0.onrender.com/index.html`)
})

bot.hears('🔗 Canales AIFU', ctx => {
  ctx.reply(`📢 RED DE INVESTIGACIÓN AIFU\n\n🇺🇾 Uruguay: https://t.me/+nCVD4NsOihIyNGFh\n🇦🇷 Argentina: https://t.me/+QpErPk26SY05OGIx\n🇨🇱 Chile: https://t.me/+VP2T47eLvIowNmYx\n🌎 Global: https://t.me/+r5XfcJma3g03MWZh`)
})

bot.hears('🛸 Reportar Avistamiento', ctx => {
  sesiones[ctx.from.id] = { paso: "pais", datos: { fotos: [] } }
  ctx.reply("¿En qué país ocurrió?", Markup.keyboard([['Uruguay', 'Argentina', 'Chile'], ['Otro'], ['❌ Cancelar']]).resize())
})

bot.on(['text', 'location', 'photo'], async (ctx, next) => {
  const id = ctx.from.id
  const s = sesiones[id]
  if (!s) return next()

  const txt = ctx.message.text
  if (txt === '❌ Cancelar') { delete sesiones[id]; return ctx.reply("Cancelado.", menuPrincipal()) }

  if (s.paso === "pais") { s.datos.pais = txt; s.paso = "ciudad"; return ctx.reply("¿Ciudad?"); }
  if (s.paso === "ciudad") { s.datos.ciudad = txt; s.paso = "barrio"; return ctx.reply("¿Barrio o zona?"); }
  
  if (s.paso === "barrio") {
    s.datos.barrio = txt
    s.paso = "ubicacion"
    return ctx.reply("¿Enviar GPS o continuar?", Markup.keyboard([[Markup.button.locationRequest('📍 Enviar GPS')], ['Continuar sin GPS'], ['❌ Cancelar']]).resize())
  }

  if (ctx.message.location && s.paso === "ubicacion") {
    s.datos.lat = ctx.message.location.latitude
    s.datos.lng = ctx.message.location.longitude
    const geo = await geolocalizacionInversa(s.datos.lat, s.datos.lng)
    s.datos.pais = geo.pais; s.datos.ciudad = geo.ciudad; s.datos.barrio = geo.barrio
    s.paso = "descripcion"; return ctx.reply(`Ubicación fijada: ${geo.ciudad}. Describí lo que viste:`)
  }

  if (txt === "Continuar sin GPS" && s.paso === "ubicacion") {
    s.paso = "descripcion"; return ctx.reply("Describí el fenómeno:")
  }

  if (s.paso === "descripcion") {
    s.datos.descripcion = txt; s.paso = "fotos"
    return ctx.reply("Enviá fotos o tocá el botón para terminar.", Markup.keyboard([['🚀 Finalizar reporte'], ['❌ Cancelar']]).resize())
  }

  if (ctx.message.photo && s.paso === "fotos") {
    s.datos.fotos.push(ctx.message.photo.pop().file_id)
    return ctx.reply("✅ Foto añadida.")
  }

  if (txt === "🚀 Finalizar reporte") {
    await publicarReporte(ctx, s.datos)
    delete sesiones[id]
  }
})

async function publicarReporte(ctx, datos) {
  const ficha = `🛸 NUEVO REPORTE AIFU\n📍 ${datos.pais}, ${datos.ciudad}\n🏠 ${datos.barrio}\n📝 ${datos.descripcion}`;
  const canal = CANALES[datos.pais] || CANALES.GLOBAL;

  try {
    for (const f of datos.fotos) await bot.telegram.sendPhoto(canal, f);
    await bot.telegram.sendMessage(canal, ficha);
    await bot.telegram.sendMessage(CANALES.CENTRAL, `🛰️ REPORTE CENTRAL:\n${ficha}`);

    guardarReporteMapa(datos);
    db.usuarios[ctx.from.id].puntos += 15;
    db.usuarios[ctx.from.id].reportes += 1;
    guardarDB();

    ctx.reply("✅ Reporte enviado al radar y a los canales.", menuPrincipal());
  } catch (err) {
    ctx.reply("⚠️ Error al publicar.");
  }
}

bot.launch().then(() => console.log("📡 AIFUCITO ONLINE"))
