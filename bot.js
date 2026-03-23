import "dotenv/config";
import { Telegraf, session, Markup } from "telegraf";
import { createClient } from "@supabase/supabase-js";
import axios from "axios";
import express from "express";
import { v4 as uuidv4 } from "uuid";

/* ==========================================
   🔒 CONTROL DE INSTANCIA ÚNICA
========================================== */
if (global.__AIFU_RUNNING__) {
  console.log("⚠️ Instancia duplicada detectada. Abortando.");
  process.exit(0);
}
global.__AIFU_RUNNING__ = true;

const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const ADMIN_ID = "7662736311"; 
const PAYPAL_EMAIL = "electros@adinet.com.uy";

/* ==========================================
   🎖️ SISTEMA DE RANGOS
========================================== */
const RANKS = [
  { min: 0, name: "Fajinador de Retretes Espaciales" },
  { min: 5, name: "Cebador del Mate del Área 51" },
  { min: 15, name: "Vigía de Naves Nodrizas" },
  { min: 30, name: "Agente Encubierto MIB" },
  { min: 100, name: "Comandante Intergaláctico" }
];

const getRank = (count) => [...RANKS].reverse().find(r => count >= r.min).name;

/* ==========================================
   📅 LÓGICA DE SUSCRIPCIÓN (REGLA 5 DÍAS)
========================================== */
const getExpiryDate = () => {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const isGracePeriod = now.getDate() >= (lastDay - 4);
  const targetMonth = isGracePeriod ? now.getMonth() + 2 : now.getMonth() + 1;
  return new Date(now.getFullYear(), targetMonth, 0, 23, 59, 59).toISOString();
};

/* ==========================================
   🧠 MEMORIA Y PERFILES
========================================== */
const memory = new Map();

async function getProfile(id) {
  if (memory.has(id)) return memory.get(id);
  let { data } = await supabase.from("sessions").select("*").eq("user_id", id).maybeSingle();
  
  if (!data) {
    data = { user_id: id, state: "IDLE", reports_count: 0, sub_expires: null, is_vip: false, lat: null, lng: null };
    await supabase.from("sessions").insert(data);
  }
  memory.set(id, data);
  return data;
}

async function updateProfile(id, patch) {
  const p = await getProfile(id);
  const u = { ...p, ...patch };
  memory.set(id, u);
  await supabase.from("sessions").update(patch).eq("user_id", id);
  return u;
}

const isPremium = (u) => u.is_vip || (u.sub_expires && new Date(u.sub_expires) > new Date());

/* ==========================================
   🤖 IA AIFUCITO (GEMINI 1.5 FLASH)
========================================== */
async function IA(text) {
  try {
    const r = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: `Eres Aifucito, bot uruguayo de ufología. Responde: ${text}` }] }] }
    );
    return r.data?.candidates?.[0]?.content?.parts?.[0]?.text || "Interferencia en la señal...";
  } catch { return "IA desconectada temporalmente."; }
}

/* ==========================================
   🚀 MENÚ Y COMANDOS
========================================== */
bot.use(session());

const menu = Markup.keyboard([
  ["📍 Nuevo Reporte", "🛰️ Ver Radar"],
  ["👤 Mi Perfil", "🤖 Aifucito"],
  ["💳 Colaborar ($3)", "❌ Cancelar"]
]).resize();

bot.start(async (ctx) => {
  await getProfile(String(ctx.from.id));
  return ctx.reply("🛸 AIFU Sistema Online. Bienvenido al proyecto, Agente.", menu);
});

// --- COMANDOS ADMIN ---
bot.hears(/^\/vip (\d+)$/, async (ctx) => {
  if (String(ctx.from.id) !== ADMIN_ID) return;
  await updateProfile(ctx.match[1], { is_vip: true });
  ctx.reply(`⭐ Usuario ${ctx.match[1]} ahora es VIP permanente.`);
});

bot.hears(/^\/pago (\d+)$/, async (ctx) => {
  if (String(ctx.from.id) !== ADMIN_ID) return;
  const expiry = getExpiryDate();
  await updateProfile(ctx.match[1], { sub_expires: expiry });
  ctx.reply(`✅ Suscripción activada. Vence el: ${new Date(expiry).toLocaleDateString()}`);
});

// --- BOTONES MENÚ ---
bot.hears("💳 Colaborar ($3)", (ctx) => {
  const link = `https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=${PAYPAL_EMAIL}&amount=3.00&currency_code=USD&item_name=AIFU_Suscripcion`;
  ctx.reply(`🚀 **MEJORA TU RANGO**\n\nApoya AIFU y desbloquea:\n- Radar histórico completo.\n- IA Aifucito sin límites.\n\n[PAGAR POR PAYPAL AQUÍ](${link})\n\n*Envía comprobante al admin para activación.*`, { parse_mode: "Markdown" });
});

bot.hears("👤 Mi Perfil", async (ctx) => {
  const u = await getProfile(String(ctx.from.id));
  const premium = isPremium(u);
  const star = u.is_vip ? " ⭐" : "";
  const statusText = premium ? (u.is_vip ? "Acceso Total" : `Colaborador (${new Date(u.sub_expires).toLocaleDateString()})`) : "Free (Radar 16h)";
  
  return ctx.reply(`🛡️ **AGENTE:** ${ctx.from.first_name}${star}\n🎖️ **RANGO:** ${getRank(u.reports_count)}\n📝 **REPORTES:** ${u.reports_count}\n⚙️ **ESTADO:** ${statusText}`);
});

bot.hears("🛰️ Ver Radar", async (ctx) => {
  const url = `${process.env.PUBLIC_URL}/index.html?user_id=${ctx.from.id}`;
  return ctx.reply("🛰️ **Accediendo al Radar Táctico**", {
    reply_markup: { inline_keyboard: [[{ text: "ABRIR MAPA 🌍", url }]] }
  });
});

bot.hears("🤖 Aifucito", async (ctx) => {
  await updateProfile(String(ctx.from.id), { state: "IA_MODE" });
  return ctx.reply("🛸 Aifucito en línea. Escribe tu consulta:");
});

bot.hears("📍 Nuevo Reporte", async (ctx) => {
  await updateProfile(String(ctx.from.id), { state: "WAIT_LOCATION" });
  return ctx.reply("📡 Envía ubicación GPS del avistamiento:", Markup.keyboard([[Markup.button.locationRequest("📍 GPS")], ["❌ Cancelar"]]).resize());
});

bot.hears("❌ Cancelar", async (ctx) => {
  await updateProfile(String(ctx.from.id), { state: "IDLE" });
  return ctx.reply("Acción cancelada. Regresando a base.", menu);
});

/* ==========================================
   📡 MANEJO DE ENTRADAS (GPS Y TEXTO)
========================================== */
bot.on("location", async (ctx) => {
  const id = String(ctx.from.id);
  const user = await getProfile(id);
  if (user.state !== "WAIT_LOCATION") return;

  await updateProfile(id, { state: "WAIT_DESC", lat: ctx.message.location.latitude, lng: ctx.message.location.longitude });
  return ctx.reply("📝 Describe brevemente qué viste:", Markup.removeKeyboard());
});

bot.on("text", async (ctx) => {
  const id = String(ctx.from.id);
  const user = await getProfile(id);
  const text = ctx.message.text;

  if (user.state === "IA_MODE") return ctx.reply(await IA(text));

  if (user.state === "WAIT_DESC") {
    const reportId = uuidv4();
    await supabase.from("reportes").insert({
      id: reportId, user_id: id, descripcion: text, 
      lat: user.lat, lng: user.lng, created_at: new Date().toISOString()
    });

    const newCount = (user.reports_count || 0) + 1;
    await updateProfile(id, { state: "IDLE", reports_count: newCount });
    
    // Alerta al canal
    bot.telegram.sendMessage(process.env.CHANNEL_CONOSUR, `🚨 **AVISTAMIENTO DETECTADO**\n📝 Desc: ${text}\n🗺️ GPS: ${user.lat}, ${user.lng}\n👤 Por: ${ctx.from.first_name}`).catch(()=>{});
    
    return ctx.reply(`✅ Reporte archivado.\n📈 Total de reportes: ${newCount}\n🎖️ Rango: ${getRank(newCount)}`, menu);
  }
});

/* ==========================================
   🌐 SERVIDOR EXPRESS (RADAR API)
========================================== */
const app = express();
app.use(express.static("public"));

// Endpoint de salud para Render
app.get("/health", (req, res) => res.status(200).send("OK"));

app.get("/api/reports", async (req, res) => {
  try {
    const user = await getProfile(req.query.user_id);
    const premium = isPremium(user);
    let query = supabase.from("reportes").select("*").order("created_at", { ascending: false });

    if (!premium) {
      const limit = new Date(Date.now() - 16 * 60 * 60 * 1000).toISOString();
      query = query.gte("created_at", limit);
    }

    const { data } = await query;
    res.json(data || []);
  } catch { res.json([]); }
});

/* ==========================================
   🔥 ARRANQUE DEL SISTEMA
========================================== */
const PORT = process.env.PORT || 10000;

async function start() {
  try {
    await bot.launch({ dropPendingUpdates: true });
    
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🌐 Radar operativo en puerto ${PORT}`);
    });

    // Mantener vivo en Render
    setInterval(() => {
      axios.get(`${process.env.PUBLIC_URL}/health`).catch(() => {});
    }, 600000); 

  } catch (err) {
    console.error("❌ Fallo en el lanzamiento:", err);
    process.exit(1);
  }
}

start();
