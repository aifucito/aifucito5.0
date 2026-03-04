import { Telegraf, Markup } from 'telegraf';
import fs from 'fs';
import path from 'path';
import { obtenerCoordenadas } from './utils/ubicacion.js';
import { detectarCategoria } from './utils/categorias.js';
import express from 'express';
import cors from 'cors';

// Creamos el bot con el token (cuidado: en producción usa variable de entorno)
const bot = new Telegraf(process.env.BOT_TOKEN);

// ---------- CONFIG ----------
// REEMPLAZÁ CON TU ID REAL
const ADMIN_ID = 123456789;
const FECHA_CORTE_FUNDADOR = new Date('2026-04-01');
const CANALES = {
  radar: '@aifu_radar',
  uy: '@aifu_uy',
  ar: '@aifu_ar',
  cl: '@aifu_cl'
};

// ---------- EXPRESS SERVIDOR PARA RENDER (FORZAMOS PUERTO) ----------
const app = express();
app.use(cors());
app.use(express.static('public'));
// Ruta de ejemplo para validar que el bot está activo
app.get('/', (req, res) => res.send('AIFUCITO 5.0 activo'));
app.listen(3000, () => console.log('Servidor Express activo en el puerto 3000'));

// ---------- DATA (USUARIOS, REPORTES) ----------
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
  if (hoy > vence) {
    usuarios[userId].vip = false;
    guardarDatos();
    return false;
  }
  return true;
}
function activarVIP(userId, metodo) {
  const hoy = new Date();
  const vence = new Date();
  vence.setMonth(vence.getMonth() + 1);
  const { plan, precio } = determinarPlan();
  usuarios[userId] = { vip: true, plan, precio, metodoPago: metodo, fechaInicio: hoy.toISOString(), fechaRenovacion: vence.toISOString() };
  guardarDatos();
}

// ---------- MENÚ PRINCIPAL ----------
bot.start(ctx => {
  ctx.reply(
    `👽 AIFUCITO 5.0
    Sistema Oficial RED AIFU`,
    Markup.keyboard([
      ['Reportar'],
      ['Mi estado'],
      ['Hazte VIP'],
      ['Red AIFU']
    ]).resize()
  );
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
 
