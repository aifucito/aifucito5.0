// ---------- AIFUCITO BOT 5.0 COMPLETO Y EXTENDIDO ----------
import { Telegraf, Markup } from 'telegraf';
import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import { obtenerCoordenadas } from './utils/ubicacion.js';
import { detectarCategoria } from './utils/categorias.js';

// ---------- CONFIG ----------
const BOT_TOKEN = process.env.BOT_TOKEN || '8701174108:AAFgEE-uSZlDvrTNm_QIeDIINqmnCzQIOCM';
const ADMIN_ID = 123456789;
const CANALES = {
  radar: '@aifu_radar',
  uy: '@aifu_uy',
  ar: '@aifu_ar',
  cl: '@aifu_cl',
  global: '@aifu_global'
};
const HISTORIAS_VIP_FILE = './data/historias_vip.json';
const FIN_PRUEBA_VIP = new Date('2026-03-11T23:59:59'); // Todos VIP hasta el miércoles 11

// ---------- EXPRESS SERVIDOR ----------
const app = express();
app.use(cors());
app.use(express.static('public'));

let reportes = [];
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor Express activo en puerto ${PORT}`));

// ---------- DATA ----------
const dataDir = './data';
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const usuariosFile = path.join(dataDir, 'usuarios.json');
const reportesFile = path.join(dataDir, 'reportes.json');

let usuarios = fs.existsSync(usuariosFile) ? JSON.parse(fs.readFileSync(usuariosFile)) : [];
reportes = fs.existsSync(reportesFile) ? JSON.parse(fs.readFileSync(reportesFile)) : [];
let historiasVIP = fs.existsSync(HISTORIAS_VIP_FILE) ? JSON.parse(fs.readFileSync(HISTORIAS_VIP_FILE)) : [];

function guardarDatos() {
  fs.writeFileSync(usuariosFile, JSON.stringify(usuarios, null, 2));
  fs.writeFileSync(reportesFile, JSON.stringify(reportes, null, 2));
  fs.writeFileSync(HISTORIAS_VIP_FILE, JSON.stringify(historiasVIP, null, 2));
}

// ---------- VIP ----------
function esVIP(userId) {
  const user = usuarios.find(u => u.id === userId);
  if (!user) return false;
  const ahora = new Date();
  // Todos son VIP hasta la fecha de prueba
  if (ahora <= FIN_PRUEBA_VIP) return true;
  // Después, solo si tienen vip real
  return user.vip === true;
}

// ---------- TOKENS TEMPORALES PARA MAPA ----------
let tokensMapa = {}; // { userId: { token, expiracion } }

// ---------- BOT ----------
const bot = new Telegraf(BOT_TOKEN);

// ---------- MENÚ PRINCIPAL ----------
function menuPrincipal() {
  return Markup.keyboard([
    ['Reportar', 'Ver Mapa'],
    ['Red AIFU', 'Mi estado'],
    ['Quiénes somos', 'Charlar con AIFUCITO'],
    ['Historias VIP']
  ]).resize();
}

// ---------- INICIO ----------
bot.start(ctx => {
  ctx.reply(
`👽 ¡Hola! Soy AIFUCITO, tu investigador del misterio 😎✨
Listo para ayudarte a reportar fenómenos y descubrir misterios del universo.
Selecciona una opción:`,
    menuPrincipal()
  );
});

// ---------- RED AIFU ----------
bot.hears('Red AIFU', ctx => {
  ctx.reply("🌟 Canales oficiales de la Red AIFU:", Markup.inlineKeyboard([
    [Markup.button.url("Radar Cono Sur", "https://t.me/+YqA6d3VpKv9mZjU5")],
    [Markup.button.url("AIFU Uruguay", "https://t.me/+nCVD4NsOihIyNGFh")],
    [Markup.button.url("AIFU Argentina", "https://t.me/+QpErPk26SY05OGIx")],
    [Markup.button.url("AIFU Chile", "https://t.me/+VP2T47eLvIowNmYx")],
    [Markup.button.url("AIFU Global", "https://t.me/+r5XfcJma3g03MWZh")]
  ]));
});

// ---------- VER MAPA ----------
bot.hears('Ver Mapa', ctx => {
  const id = ctx.from.id;
  if (!esVIP(id)) {
    ctx.reply("🌍 Acceso limitado al mapa. Hazte VIP para ver todo.");
    return;
  }
  // Crear token temporal
  const token = Math.random().toString(36).substring(2, 12);
  tokensMapa[id] = { token, expiracion: Date.now() + 5 * 60 * 1000 }; // 5 minutos
  ctx.reply(`🌍 Accede al mapa aquí: https://tu-servidor.com/mapa?user=${id}&token=${token}`);
});

// ---------- SERVIR MAPA CON TOKEN ----------
app.get('/mapa', (req, res) => {
  const { user, token } = req.query;
  if (!tokensMapa[user] || tokensMapa[user].token !== token || Date.now() > tokensMapa[user].expiracion) {
    return res.status(403).send('Acceso denegado. Ingresa desde Telegram.');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------- ESTADO ----------
bot.hears('Mi estado', ctx => {
  const id = ctx.from.id;
  if (esVIP(id)) ctx.reply(`⭐ ¡Genial! Tienes VIP activo 🚀\nDisfruta de todos los reportes, mapa completo y multimedia.`);
  else ctx.reply(`Cuenta estándar activa. ✨ Hazte VIP para disfrutar de todas las sorpresas de AIFUCITO!`);
});

// ---------- QUIÉNES SOMOS ----------
bot.hears('Quiénes somos', ctx => {
  ctx.reply("👽 AIFU = Avistamiento e Investigación de Fenómenos Uruguayos\nObjetivo: registrar, analizar y compartir fenómenos anómalos en tiempo real.");
});

// ---------- HISTORIAS VIP ----------
bot.hears('Historias VIP', ctx => {
  const id = ctx.from.id;
  if (!esVIP(id)) { ctx.reply("🌟 Historias VIP solo para usuarios VIP."); return; }
  if (historiasVIP.length === 0) ctx.reply("No hay historias registradas aún. Sé el primero!");
  else {
    const historiasTexto = historiasVIP.map((h,i) => `📖 Historia #${i+1}:\n${h.historia}`).join('\n\n');
    ctx.reply(historiasTexto);
  }
});

// ---------- REPORTE ----------
let sesiones = {};
bot.hears('Reportar', ctx => {
  const id = ctx.from.id;
  if (!usuarios.find(u=>u.id===id)) { 
    usuarios.push({id, vipTemporal:true, fecha:new Date().toISOString()}); 
    guardarDatos(); 
  }
  sesiones[id] = { estado: 'inicio' };
  ctx.reply('📍 ¡Hora de reportar un fenómeno! Envía tu ubicación GPS o selecciona "No tengo GPS":',
    Markup.keyboard([
      [Markup.button.locationRequest('Enviar ubicación GPS')],
      ['No tengo GPS']
    ]).resize()
  );
});

// ---------- UBICACIÓN ----------
bot.on('location', ctx => {
  const id = ctx.from.id;
  if (!sesiones[id]) return;
  sesiones[id] = {...sesiones[id], estado:'descripcion', lat: ctx.message.location.latitude, lng: ctx.message.location.longitude};
  ctx.reply("📌 Ubicación recibida. Describe el fenómeno observado:");
});

// ---------- FLUJO TEXTO REPORTE Y CHARLA ----------
let sesionesChat = {};
bot.on('text', async ctx => {
  const id = ctx.from.id;
  const texto = ctx.message.text;

  // Charla con AIFUCITO
  if (sesiones[id]?.chatActiva || sesionesChat[id]?.activa) {
    const respuestas = [
      `👽 Hmm… interesante sobre "${texto}". Analizando…`,
      `🚀 ¡Vaya! Esto parece un misterio cósmico: "${texto}"`,
      `✨ ¡Genial! "${texto}" será estudiado por AIFUCITO`,
      `😎 ¡Wow! Nunca había visto algo así: "${texto}"`,
      `🛸 Esto podría estar relacionado con fenómenos recientes en tu zona.`
    ];
    const respuesta = respuestas[Math.floor(Math.random()*respuestas.length)];
    ctx.reply(respuesta, Markup.keyboard([['Terminar charla'], ['Menú principal']]).resize());
    return;
  }

  // Historias VIP
  if (sesiones[id]?.estado==='historia') {
    historiasVIP.push({ usuario:id, historia:texto });
    guardarDatos();
    ctx.reply('✅ Historia registrada en VIP con éxito!', menuPrincipal());
    delete sesiones[id];
    return;
  }

  // Flujo de reporte
  if (!sesiones[id]) return;
  const sesion = sesiones[id];
  if (sesion.estado==='inicio' && texto==='No tengo GPS') { sesion.estado='descripcion'; ctx.reply("Indica ubicación aproximada y describe el fenómeno:"); return; }
  if (sesion.estado==='descripcion') { 
    sesion.mensaje = texto; 
    sesion.categoria = detectarCategoria(texto)||'Indefinido'; 
    sesion.estado = 'multimedia'; 
    ctx.reply('¿Deseas agregar multimedia?', Markup.keyboard([['Foto'], ['Video'], ['Ninguno']]).resize()); 
    return; 
  }
  if (sesion.estado==='multimedia') {
    if(texto==='Foto') { sesion.estado='esperandoFoto'; ctx.reply('📷 Envía la foto ahora:'); return; }
    if(texto==='Video') { sesion.estado='esperandoVideo'; ctx.reply('🎥 Envía el video ahora:'); return; }
    if(texto==='Ninguno') { await finalizarReporte(ctx,sesion); delete sesiones[id]; return; }
  }
});

// ---------- MULTIMEDIA ----------
bot.on('photo', async ctx => {
  const id = ctx.from.id;
  if(!sesiones[id] || sesiones[id].estado!=='esperandoFoto') return;
  sesiones[id].multimedia = sesiones[id].multimedia||[];
  sesiones[id].multimedia.push({tipo:'foto', file_id: ctx.message.photo.pop().file_id});
  await finalizarReporte(ctx, sesiones[id]);
  delete sesiones[id];
});
bot.on('video', async ctx => {
  const id = ctx.from.id;
  if(!sesiones[id] || sesiones[id].estado!=='esperandoVideo') return;
  sesiones[id].multimedia = sesiones[id].multimedia||[];
  sesiones[id].multimedia.push({tipo:'video', file_id: ctx.message.video.file_id});
  await finalizarReporte(ctx, sesiones[id]);
  delete sesiones[id];
});

// ---------- FINALIZAR REPORTE ----------
async function finalizarReporte(ctx, sesion){
  const id = ctx.from.id;
  const coords = sesion.lat && sesion.lng ? { lat: sesion.lat, lng: sesion.lng } : await obtenerCoordenadas(sesion.mensaje);
  const nuevoReporte = { 
    id: Date.now(), 
    usuario: id, 
    fecha: new Date().toISOString(), 
    mensaje: sesion.mensaje, 
    categoria: sesion.categoria, 
    lat: coords.lat||null, 
    lng: coords.lng||null, 
    multimedia: sesion.multimedia||[], 
    vip: esVIP(id) 
  };
  reportes.push(nuevoReporte);
  guardarDatos();
  await publicarReporte(nuevoReporte);
  ctx.reply(`✅ Reporte enviado con éxito! ${esVIP(id)?'⭐ Eres VIP 🚀':''}`, menuPrincipal());
}

// ---------- PUBLICAR REPORTES ----------
async function publicarReporte(reporte){
  const chatId = CANALES.radar;
  let texto = `📡 ¡Reporte AIFUCITO!\nCategoría: ${reporte.categoria}\nFecha: ${reporte.fecha}`;
  try{ await bot.telegram.sendMessage(chatId, texto); } catch(err){ console.error(err); }
  if(reporte.multimedia){
    for(const m of reporte.multimedia){
      try{
        if(m.tipo==='foto') await bot.telegram.sendPhoto(chatId,m.file_id,{caption:'📷 Foto compartida'});
        if(m.tipo==='video') await bot.telegram.sendVideo(chatId,m.file_id,{caption:'🎥 Video compartido'});
      }catch(err){console.error(err);}
    }
  }
}

// ---------- CHARLA AIFUCITO ----------
bot.hears('Charlar con AIFUCITO', ctx => {
  sesionesChat[ctx.from.id] = { activa:true };
  ctx.reply('👽 ¡Hola! Soy AIFUCITO, listo para charlar sobre OVNIs, fenómenos paranormales y más.', Markup.keyboard([['Terminar charla'], ['Menú principal']]).resize());
});
bot.hears('Terminar charla', ctx => {
  delete sesionesChat[ctx.from.id];
  ctx.reply('👋 Fucito vuelve a sus investigaciones cósmicas.', menuPrincipal());
});

// ---------- ADMIN ----------
bot.command('panel', ctx => {
  if(ctx.from.id!==ADMIN_ID) return;
  ctx.reply(`Panel Admin:\nUsuarios: ${usuarios.length}\nReportes: ${reportes.length}`);
});

// ---------- LANZAR BOT ----------
bot.launch().then(()=>console.log('AIFUCITO activo'));

// ---------- ERRORES ----------
bot.catch(console.error);
process.on('unhandledRejection', console.error);
process.on('uncaughtException', console.error);
