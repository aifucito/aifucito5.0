import "dotenv/config";
import { Telegraf, Markup } from "telegraf";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";

/* ==========================================
   💎 1. CONFIGURACIÓN DE ROLES Y PAGOS
========================================== */
const OWNER_ID = "7662736311";
const PLANES = {
  FREE: { ai_limit: 3, radar_history_days: 7, priority: false, label: "GRATUITO" },
  PREMIUM: { ai_limit: Infinity, radar_history_days: 365, priority: true, label: "COLABORADOR 💎" }
};

const PAYMENTS = {
  methods: ["MercadoPago", "PayPal", "Prex", "Transferencia"],
  links: {
    mp: "https://tu-link-mercadopago.com",
    paypal: "https://paypal.me/tu-cuenta"
  }
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const bot = new Telegraf(process.env.BOT_TOKEN);
const aiModel = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-1.5-flash" });

/* ==========================================
   🧠 2. UTILIDADES DE CONTROL REAL
========================================== */
const getProfile = async (id) => {
  let { data } = await supabase.from("sessions").select("*").eq("user_id", id).maybeSingle();
  if (!data) {
    const fresh = { user_id: id, state: "IDLE", xp: 0, ai_count: 0, payment_status: "free", is_premium: false };
    const { data: n } = await supabase.from("sessions").insert(fresh).select().single();
    return n;
  }
  return data;
};

const getLimits = (user) => user.is_premium ? PLANES.PREMIUM : PLANES.FREE;
const isAdmin = (id) => String(id) === OWNER_ID;

const menu = Markup.keyboard([
  ["📍 Reportar", "🛰️ Radar"],
  ["👤 Perfil", "🤖 IA"],
  ["💳 Colaborar", "⬅️ Menú"]
]).resize();

/* ==========================================
   🚀 3. LÓGICA DEL BOT (ESTADOS Y PRIVILEGIOS)
========================================== */

bot.start(async (ctx) => {
  await getProfile(String(ctx.from.id));
  ctx.reply("🌌 **SISTEMA RADAR AIFU V12**\nPlataforma de vigilancia y análisis geográfico.", menu);
});

bot.hears("⬅️ Menú", async (ctx) => {
  await supabase.from("sessions").update({ state: "IDLE" }).eq("user_id", String(ctx.from.id));
  return ctx.reply("Sincronizando con la base...", menu);
});

bot.hears("👤 Perfil", async (ctx) => {
  const user = await getProfile(String(ctx.from.id));
  const limits = getLimits(user);
  ctx.reply(`🎖️ **FICHA TÁCTICA**\n👤 ID: ${user.user_id}\n📊 XP: ${user.xp}\n💎 Estado: ${limits.label}\n🤖 Consultas IA: ${user.ai_count}/${limits.ai_limit === Infinity ? "∞" : limits.ai_limit}`);
});

bot.hears("🤖 IA", async (ctx) => {
  const user = await getProfile(String(ctx.from.id));
  const limits = getLimits(user);
  
  if (!user.is_premium && user.ai_count >= limits.ai_limit) {
    return ctx.reply("🚫 **Límite IA Alcanzado**\nLos agentes gratuitos solo tienen 3 consultas. Pásate a COLABORADOR para acceso ilimitado.");
  }
  
  await supabase.from("sessions").update({ state: "IA" }).eq("user_id", String(ctx.from.id));
  ctx.reply("🛸 **Aifucito Online:** ¿Qué quieres analizar tú hoy? (Usa '⬅️ Menú' para salir)");
});

bot.on("text", async (ctx) => {
  const id = String(ctx.from.id);
  const user = await getProfile(id);
  const text = ctx.message.text;

  if (text === "⬅️ Menú") return;

  // ESTADO: DESCRIPCIÓN DE REPORTE
  if (user.state === "WAIT_DESC") {
    await supabase.from("reportes").insert({
      id: uuidv4(), user_id: id, lat: user.lat, lng: user.lng, ciudad: user.ciudad, pais: user.pais, descripcion: text, created_at: new Date().toISOString()
    });
    await supabase.from("sessions").update({ state: "IDLE", xp: user.xp + 20 }).eq("user_id", id);
    return ctx.reply("✅ **Reporte Archivado.** Ya es parte del mapa histórico.", menu);
  }

  // ESTADO: CHAT IA CON CONTROL DE LÍMITES
  if (user.state === "IA") {
    const limits = getLimits(user);
    if (user.ai_count >= limits.ai_limit) return ctx.reply("🚫 Límite alcanzado.");

    try {
      await ctx.sendChatAction("typing");
      const res = await aiModel.generateContent(`Eres Aifucito, asistente uruguayo amable de RADAR AIFU. Usuario: ${ctx.from.first_name}. Dice: ${text}`);
      await supabase.from("sessions").update({ ai_count: user.ai_count + 1 }).eq("user_id", id);
      return ctx.reply(`🛸 ${res.response.text()}`);
    } catch (e) { return ctx.reply("⚠️ Error de conexión IA."); }
  }
});

/* ==========================================
   📊 4. API RADAR (HISTÓRICO E INTELIGENCIA)
========================================== */
const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/historico/:range", async (req, res) => {
  const ranges = { "24h": 1, "7d": 7, "1m": 30, "1y": 365 };
  const days = ranges[req.params.range] || 7;
  const from = new Date(Date.now() - days * 86400000).toISOString();

  const { data } = await supabase.from("reportes").select("pais, ciudad, created_at").gte("created_at", from);

  // AGREGACIÓN DE HOTSPOTS (INTELIGENCIA)
  const stats = {};
  data.forEach(r => {
    const key = `${r.pais} - ${r.ciudad}`;
    stats[key] = (stats[key] || 0) + 1;
  });

  res.json({
    range: req.params.range,
    total_reportes: data.length,
    hotspots: Object.entries(stats).sort((a,b) => b[1] - a[1]).slice(0, 5)
  });
});

/* ==========================================
   🛡️ 5. MANDO COMANDANTE (ADMIN)
========================================== */
bot.command("broadcast", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const msg = ctx.message.text.replace("/broadcast ", "");
  const { data } = await supabase.from("sessions").select("user_id");

  ctx.reply(`🚀 Desplegando a ${data.length} agentes...`);
  for (const u of data) {
    bot.telegram.sendMessage(u.user_id, `📢 **AVISO COMANDANTE:**\n\n${msg}`).catch(() => {});
    await new Promise(r => setTimeout(r, 100));
  }
});

// ACTIVACIÓN MANUAL PREMIUM (Para cuando te manden el comprobante)
bot.command("activar", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const targetId = ctx.message.text.split(" ")[1];
  if (!targetId) return ctx.reply("Uso: /activar ID_DEL_USUARIO");

  await supabase.from("sessions").update({ is_premium: true, payment_status: "premium" }).eq("user_id", targetId);
  bot.telegram.sendMessage(targetId, "💎 **¡TU CUENTA HA SIDO ELEVADA A COLABORADOR!**\nAhora tienes IA ilimitada y acceso al histórico total.");
  ctx.reply(`✅ Usuario ${targetId} activado.`);
});

bot.launch();
app.listen(process.env.PORT || 10000, () => console.log("📡 RADAR V12 OMNI ONLINE"));
