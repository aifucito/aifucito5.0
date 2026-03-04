import { Telegraf, Markup } from 'telegraf';
import fs from 'fs';
import path from 'path';
import { obtenerCoordenadas } from './utils/ubicacion.js';
import { detectarCategoria } from './utils/categorias.js';
import express from 'express';
import cors from 'cors';

const bot = new Telegraf(process.env.BOT_TOKEN);

// ---------- CONFIG ----------
const ADMIN_ID = 000000000; // ← TU ID
const FECHA_CORTE_FUNDADOR = new Date('2026-04-01');
const CANALES = { radar: '@aifu_radar', uy: '@aifu_uy', ar: '@aifu_ar', cl: '@aifu_cl' };

// ---------- EXPRESS SERVIDOR PARA RENDER ----------
const app = express();
app.use(cors());
app.use(express.static('public'));
app.get('/reportes.json', (req, res) => {
  res.json(reportes);
});
app.listen(3000, () => console.log('Servidor Express activo en puerto 3000'));

// ---------- DATA ----------
const dataDir = path.join('./data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
const usuariosFile = path.join(dataDir, 'usuarios.json');
const reportesFile = path.join(dataDir, 'reportes.json');
let usuarios = fs.existsSync(usuariosFile) ? JSON.parse(fs.readFileSync(usuariosFile)) : {};
let reportes = fs.existsSync(reportesFile) ? JSON.parse(fs.readFileSync(reportesFile)) : [];
function guardarDatos() {
  fs.writeFileSync(usuariosFile, JSON.stringify(usuarios, null, 2));
  fs.writeFileSync(reportesFile, JSON.stringify(reportes, null, 2));
}

// ---------- VIP ----------
function determinarPlan() {
  if (new Date() < FECHA_CORTE_FUNDADOR) return { plan: 'fundador', precio: 1.5 };
  return { plan: 'estandar', precio: 3 };
}
function esVIP(userId) {
  if (!usuarios[userId] || !usuarios[userId].vip) return false;
  const hoy = new Date();
  const vence = new Date(usuarios[userId].fechaRenovacion);
  if (hoy > vence) { usuarios[userId].vip = false; guardarDatos(); return false; }
  return true;
}
function activarVIP(userId, metodo) {
  const hoy = new Date();
  const vence = new Date(); vence.setMonth(vence.getMonth() + 1);
  const { plan, precio } = determinarPlan();
  usuarios[userId] = { vip: true, plan, precio, metodoPago: metodo, fechaInicio: hoy.toISOString(), fechaRenovacion: vence.toISOString() };
  guardarDatos();
}

// ---------- MENÚ ----------
bot.start(ctx => {
  ctx.reply(
`👽 AIFUCITO 5.0
Sistema Oficial RED AIFU`,
  Markup.keyboard([['Reportar'],['Mi estado'],['Hazte VIP'],['Red AIFU']]).resize());
});

// ---------- RED AIFU ----------
bot.hears('Red AIFU', ctx => {
  ctx.reply("Canales oficiales:", Markup.inlineKeyboard([
    [Markup.button.url("Radar Cono Sur", "https://t.me/+YqA6d3VpKv9mZjU5")],
    [Markup.button.url("AIFU Uruguay", "https://t.me/+nCVD4NsOihIyNGFh")],
    [Markup.button.url("AIFU Argentina", "https://t.me/+QpErPk26SY05OGIx")],
    [Markup.button.url("AIFU Chile", "https://t.me/+VP2T47eLvIowNmYx")],
    [Markup.button.url("AIFU Global", "https://t.me/+r5XfcJma3g03MWZh")]
  ]));
});

// ---------- ESTADO ----------
bot.hears('Mi estado', ctx => {
  const id = ctx.from.id;
  if (esVIP(id)) ctx.reply(`⭐ VIP activo.\nRenovación: ${usuarios[id].fechaRenovacion}`);
  else ctx.reply("Cuenta estándar activa.");
});

// ---------- INFO VIP ----------
bot.hears('Hazte VIP', ctx => {
  const { plan, precio } = determinarPlan();
  ctx.reply(
`⭐ Membresía VIP AIFU
Plan: ${plan.toUpperCase()}
Precio mensual: USD ${precio}
Beneficios: Acceso completo, multimedia, radar prioritario, alertas avanzadas
Métodos: PayPal, Mercado Pago, Prex, MiDinero
Envía comprobante y espera activación.`);
});

// ---------- REPORTE ----------
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
      id: Date.now(), usuario: id, fecha: new Date().toISOString(),
      pais: sesion.pais, ciudad: sesion.ciudad, barrio: sesion.barrio, referencia: sesion.referencia,
      mensaje: ctx.message.text, categoria, lat: coords?.lat || null, lng: coords?.lng || null,
      multimedia: [], vip: esVIP(id)
    };
    reportes.push(nuevoReporte); guardarDatos(); publicarReporte(nuevoReporte);
    delete sesiones[id]; ctx.reply("Reporte registrado correctamente.");
  }
});

// ---------- PUBLICACIÓN ----------
function publicarReporte(reporte) {
  let texto = `📡 Nuevo reporte\nUbicación: ${reporte.pais}, ${reporte.ciudad}, ${reporte.barrio}\nFecha: ${reporte.fecha}\nCategoría: ${reporte.categoria}`;
  if (reporte.vip) texto += "\n⭐ Usuario VIP";
  bot.telegram.sendMessage(CANALES.radar, texto);
}

// ---------- ADMIN ----------
bot.command('activarvip', ctx => {
  if (ctx.from.id !== ADMIN_ID) return;
  const [_, userId, metodo] = ctx.message.text.split(' ');
  activarVIP(userId, metodo || 'manual');
  ctx.reply("VIP activado correctamente.");
});
bot.command('panel', ctx => {
  if (ctx.from.id !== ADMIN_ID) return;
  ctx.reply(`Panel Admin:\nUsuarios: ${Object.keys(usuarios).length}\nReportes totales: ${reportes.length}`);
});

// ---------- LANZAMIENTO ----------
bot.launch();
console.log("AIFUCITO 5.0 activo");
