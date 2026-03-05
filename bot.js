// bot.js
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
const CANALES = { radar: '@aifu_radar', uy: '@aifu_uy', ar: '@aifu_ar', cl: '@aifu_cl' };
const URL_MAPA = 'https://tu-servidor.com/mapa'; // cambia por la URL de tu mapa con Leaflet

// ---------- EXPRESS SERVIDOR PARA RENDER ----------
const app = express();
app.use(cors());
app.use(express.static('public'));
let reportes = [];
app.get('/reportes.json', (req, res) => res.json(reportes));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor Express activo en puerto ${PORT}`));

// ---------- DATA ----------
const dataDir = path.join('./data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
const usuariosFile = path.join(dataDir, 'usuarios.json');
const reportesFile = path.join(dataDir, 'reportes.json');
let usuarios = fs.existsSync(usuariosFile) ? JSON.parse(fs.readFileSync(usuariosFile)) : [];
reportes = fs.existsSync(reportesFile) ? JSON.parse(fs.readFileSync(reportesFile)) : [];
function guardarDatos() {
  fs.writeFileSync(usuariosFile, JSON.stringify(usuarios, null, 2));
  fs.writeFileSync(reportesFile, JSON.stringify(reportes, null, 2));
}

// ---------- VIP ----------
const MES_PROMOCION = new Date().getMonth();
const ANIO_PROMOCION = new Date().getFullYear();
const FECHA_LIMITE_VIP_PRUEBA = new Date('2026-03-06');
function determinarPlan() {
  const hoy = new Date();
  if (hoy < FECHA_LIMITE_VIP_PRUEBA) return { plan: 'fundador-prueba', precio: 0, vipTemporal: true };
  if (hoy.getMonth() === MES_PROMOCION && hoy.getFullYear() === ANIO_PROMOCION) return { plan: 'promocion', precio: 1.50, vipDePorVida: true };
  return { plan: 'estandar', precio: 3 };
}
function esVIP(userId) {
  const user = usuarios.find(u => u.id === userId);
  if (!user || !user.vip) return false;
  const hoy = new Date();
  const vence = new Date(user.fechaRenovacion);
  if (hoy > vence) { user.vip = false; guardarDatos(); return false; }
  return true;
}
function activarVIP(userId, metodo = 'manual') {
  const hoy = new Date();
  const { plan, precio, vipDePorVida, vipTemporal } = determinarPlan();
  const vence = new Date();
  if (vipDePorVida || vipTemporal) vence.setFullYear(2099); 
  else vence.setMonth(vence.getMonth() + 1);
  const usuarioExistente = usuarios.find(u => u.id === userId);
  if (usuarioExistente) {
    usuarioExistente.vip = true;
    usuarioExistente.plan = plan;
    usuarioExistente.precio = precio;
    usuarioExistente.metodoPago = metodo;
    usuarioExistente.fechaInicio = hoy.toISOString();
    usuarioExistente.fechaRenovacion = vence.toISOString();
  } else {
    usuarios.push({ id: userId, vip: true, plan, precio, metodoPago: metodo, fechaInicio: hoy.toISOString(), fechaRenovacion: vence.toISOString() });
  }
  guardarDatos();
}

// ---------- BOT ----------
const bot = new Telegraf(BOT_TOKEN);

// MENÚ PRINCIPAL Y BIENVENIDA
bot.start(ctx => {
  ctx.reply(
`👽 ¡Bienvenido a tu asistente virtual AIFUCITO!
Tu acceso a la RED AIFU y reportes de fenómenos.`,
  Markup.keyboard([['Reportar'], ['Mi estado'], ['Hazte VIP'], ['Ver Mapa'], ['Red AIFU']]).resize()
  );
});

// RED AIFU / CANALES
function mostrarCanales(ctx) {
  ctx.reply("Canales oficiales:", Markup.inlineKeyboard([
    [Markup.button.url("Radar Cono Sur", "https://t.me/+YqA6d3VpKv9mZjU5")],
    [Markup.button.url("AIFU Uruguay", "https://t.me/+nCVD4NsOihIyNGFh")],
    [Markup.button.url("AIFU Argentina", "https://t.me/+QpErPk26SY05OGIx")],
    [Markup.button.url("AIFU Chile", "https://t.me/+VP2T47eLvIowNmYx")],
    [Markup.button.url("AIFU Global", "https://t.me/+r5XfcJma3g03MWZh")]
  ]));
}
bot.hears('Red AIFU', mostrarCanales);

// VER MAPA
bot.hears('Ver Mapa', ctx => {
  ctx.reply(`🌍 Ver el mapa interactivo aquí: ${URL_MAPA}`);
});

// ESTADO
bot.hears('Mi estado', ctx => {
  const id = ctx.from.id;
  if (esVIP(id)) ctx.reply(`⭐ VIP activo.\nRenovación: ${usuarios.find(u => u.id === id).fechaRenovacion}`);
  else ctx.reply("Cuenta estándar activa.");
});

// INFO VIP
bot.hears('Hazte VIP', ctx => {
  const { plan, precio } = determinarPlan();
  ctx.reply(
`⭐ Membresía VIP AIFU
Plan: ${plan.toUpperCase()}
Precio mensual: USD ${precio}
Beneficios: Acceso completo, multimedia, radar prioritario, alertas avanzadas
Métodos: PayPal, Mercado Pago, Prex, MiDinero
Envía comprobante y espera activación.`
  );
});

// REPORTE
let sesiones = {};
bot.hears('Reportar', ctx => {
  sesiones[ctx.from.id] = { estado: 'pais' };
  ctx.reply("Indica tu país:");
});
bot.on('text', async ctx => {
  const id = ctx.from.id;
  if (!sesiones[id]) return;
  const sesion = sesiones[id];

  if (sesion.estado === 'pais') { sesion.pais = ctx.message.text; sesion.estado = 'ciudad'; ctx.reply("Indica la ciudad:"); return; }
  if (sesion.estado === 'ciudad') { sesion.ciudad = ctx.message.text; sesion.estado = 'barrio'; ctx.reply("Indica barrio/localidad/comuna o zona:"); return; }
  if (sesion.estado === 'barrio') { sesion.barrio = ctx.message.text; sesion.estado = 'referencia'; ctx.reply("Agrega referencia (opcional):"); return; }
  if (sesion.estado === 'referencia') { sesion.referencia = ctx.message.text; sesion.estado = 'descripcion'; ctx.reply("Describe el fenómeno:"); return; }

  if (sesion.estado === 'descripcion') {
    const categoria = detectarCategoria(ctx.message.text);
    const coords = await obtenerCoordenadas(`${sesion.pais}, ${sesion.ciudad}, ${sesion.barrio}, ${sesion.referencia}`);
    const nuevoReporte = {
      id: Date.now(),
      usuario: id,
      fecha: new Date().toISOString(),
      pais: sesion.pais,
      ciudad: sesion.ciudad,
      barrio: sesion.barrio,
      referencia: sesion.referencia,
      mensaje: ctx.message.text,
      categoria,
      lat: coords?.lat || null,
      lng: coords?.lng || null,
      multimedia: [],
      vip: esVIP(id)
    };
    reportes.push(nuevoReporte);
    guardarDatos();
    publicarReporte(nuevoReporte);
    delete sesiones[id];

    let confirmMsg = `✅ Tu reporte fue registrado correctamente.`;
    if (esVIP(id)) confirmMsg += "\n⭐ Eres usuario VIP";
    ctx.reply(confirmMsg, Markup.keyboard([['Ver Mapa'], ['Red AIFU'], ['Reportar']]).resize());
  }
});

// PUBLICACIÓN
function publicarReporte(reporte) {
  let texto = `📡 Nuevo reporte\nUbicación: ${reporte.pais}, ${reporte.ciudad}, ${reporte.barrio}\nFecha: ${reporte.fecha}\nCategoría: ${reporte.categoria}`;
  if (reporte.vip) texto += "\n⭐ Usuario VIP";
  bot.telegram.sendMessage(CANALES.radar, texto).catch(console.error);
}

// ADMIN
bot.command('activarvip', ctx => {
  if (ctx.from.id !== ADMIN_ID) return;
  const [_, userId, metodo] = ctx.message.text.split(' ');
  activarVIP(parseInt(userId), metodo);
  ctx.reply("VIP activado correctamente.");
});
bot.command('panel', ctx => {
  if (ctx.from.id !== ADMIN_ID) return;
  ctx.reply(`Panel Admin:\nUsuarios: ${usuarios.length}\nReportes totales: ${reportes.length}`);
});

// LANZAMIENTO
bot.launch().then(() => console.log("AIFUCITO 5.0 activo"));

// Manejo de errores global
bot.catch(err => console.error('Error en bot:', err));
process.on('unhandledRejection', console.error);
process.on('uncaughtException', console.error);
