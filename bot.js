// ==========================================
// 🌌 AIFU BOT V6.0 - NÚCLEO OMEGA GOLD (FINAL)
// ==========================================
import "dotenv/config";
import { Telegraf, Markup, session } from "telegraf";
import axios from "axios";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const app = express();

const ADMIN_ID = String(process.env.ADMIN_ID);

/* ===============================
   🎖️ RANGOS UNIFICADOS (GAMERS)
=============================== */
const RANGOS = [
  { min: 0, name: "🔭 Observador Civil" },
  { min: 1, name: "🚽 Fajinador de retretes espaciales" },
  { min: 5, name: "💂 Guardaespaldas de Alf" },
  { min: 10, name: "🧉 Cebador del mate del Área 51" },
  { min: 20, name: "🛰️ Centinela del Espacio" },
  { min: 35, name: "🛸 Experto CRIDOVNI" }
];

const esc = (t) => t ? String(t).replace(/[_*\[\]()~`>#+=|{}.!-]/g, "\\$&") : "";

const menu = () => Markup.keyboard([
  ["📍 Reportar"],
  ["🤖 Aifucito", "👤 Perfil"],
  ["🗺️ Ver Mapa", "🤝 Ser Colaborador"]
]).resize();

/* ===============================
   🛰️ MOTOR GEO-INVERSO TÁCTICO
=============================== */
async function reverseGeocode(lat, lon) {
  try {
    const r = await axios.get("https://nominatim.openstreetmap.org/reverse", {
      params: { lat, lon, format: "json", zoom: 10 },
      headers: { "User-Agent": "AIFU-V6-GPS" }
    });
    const addr = r.data.address;
    const ciudad = addr.city || addr.town || addr.village || addr.state || "Zona Desconocida";
    const paisNom = addr.country || "";
    
    let paisCode = "GLOBAL";
    if (paisNom.toLowerCase().includes("uruguay")) paisCode = "UY";
    if (paisNom.toLowerCase().includes("argentina")) paisCode = "AR";
    if (paisNom.toLowerCase().includes("chile")) paisCode = "CL";

    return { ciudad, pais: paisCode, paisNombre: paisNom };
  } catch (e) {
    return { ciudad: "Coordenadas GPS", pais: "GLOBAL", paisNombre: "Internacional" };
  }
}

/* ===============================
   🚀 SERVER EXPRESS (WEBHOOK + API)
=============================== */
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.get("/api/reportes", async (req, res) => {
  const { data } = await supabase.from("reportes").select("*").order("created_at", { ascending: false });
  res.json(data || []);
});

app.get("/status", (_, res) => res.send("AIFU V6.0 GPS ONLINE"));

/* ===============================
   🧠 MIDDLEWARE: PERSISTENCIA CRÍTICA
=============================== */
bot.use(session());
bot.use(async (ctx, next) => {
  if (!ctx.from?.id) return next();
  const uid = String(ctx.from.id);
  ctx.session ||= { state: "IDLE" };

  try {
    let { data: user } = await supabase.from("usuarios").select("*").eq("id", uid).maybeSingle();
    if (!user) {
      user = { id: uid, nombre: ctx.from.first_name || "Agente", rol: "🔭 Observador Civil", reportes: 0 };
      await supabase.from("usuarios").insert([user]);
    }
    ctx.state.user = user;

    if (ctx.session.state === "IDLE") {
      const { data: ses } = await supabase.from("sesiones").select("data").eq("id", uid).maybeSingle();
      if (ses?.data?.state) ctx.session = ses.data;
    }

    await next();

    await supabase.from("sesiones").upsert({ id: uid, data: ctx.session, updated_at: new Date() });
  } catch (e) { return next(); }
});

/* ===============================
   📍 FLUJO GPS OBLIGATORIO
=============================== */
bot.hears("📍 Reportar", (ctx) => {
  ctx.session.state = "WAIT_GPS";
  ctx.reply(
    "🛰️ **INICIANDO LOCALIZACIÓN**\n\nPor favor, enviá tu ubicación por GPS (Clip 📎 > Ubicación).\n_Solo se acepta señal de satélite directa._",
    Markup.keyboard([[Markup.button.locationRequest("📍 Enviar señal GPS")]], { one_time_keyboard: true }).resize()
  );
});

bot.on("location", async (ctx) => {
  if (ctx.session.state !== "WAIT_GPS") return;
  const { latitude: lat, longitude: lng } = ctx.message.location;
  
  ctx.reply("📡 Procesando coordenadas...");
  const geo = await reverseGeocode(lat, lng);
  
  ctx.session = { ...ctx.session, lat, lng, ciudad: geo.ciudad, pais: geo.pais, state: "WAIT_DESC" };
  
  return ctx.reply(`📍 Zona captada: *${geo.ciudad}*\n\nDescribí el avistamiento (obligatorio):`, { parse_mode: "Markdown" });
});

/* ===============================
   📝 PROCESAMIENTO FINAL (CONO SUR)
=============================== */
async function stepReport(ctx) {
  const desc = ctx.message.text || ctx.message.caption;
  if (!desc || desc.length < 5) return ctx.reply("❌ Brindá una descripción válida del evento.");

  const fileid = ctx.message.photo?.pop()?.file_id || ctx.message.video?.file_id;
  
  // 1. Calcular rango futuro
  const nuevosReportes = (ctx.state.user.reportes || 0) + 1;
  const nuevoRol = RANGOS.slice().reverse().find(r => nuevosReportes >= r.min)?.name;

  // 2. Guardar en Supabase con manejo de errores
  const { error: errorReporte } = await supabase.from("reportes").insert([{ 
    id: uuidv4(), 
    user_id: String(ctx.from.id), 
    lat: ctx.session.lat, 
    lng: ctx.session.lng, 
    ciudad: ctx.session.ciudad, 
    pais: ctx.session.pais,
    descripcion: desc, 
    rango: nuevoRol,
    file_id: fileid,
    created_at: new Date().toISOString()
  }]);

  if (errorReporte) {
    console.error("❌ ERROR REPORTES:", errorReporte.message);
    return ctx.reply("⚠️ Interferencia en la DB: No se pudo guardar el reporte. Intentá más tarde.");
  }

  // 3. Actualizar Usuario
  await supabase.from("usuarios").update({ 
    reportes: nuevosReportes, 
    rol: nuevoRol 
  }).eq("id", String(ctx.from.id));

  // 4. Publicación en Canales
  const msg = `🛸 *AVISTAMIENTO DETECTADO*\n📍 ${esc(ctx.session.ciudad)}\n👤 Agente: ${esc(ctx.from.first_name)}\n🎖️ Rango: ${esc(nuevoRol)}\n📝 ${esc(desc)}`;
  
  const queue = [{ channel: process.env.CHANNEL_CONOSUR, msg }];
  if (["UY", "AR", "CL"].includes(ctx.session.pais)) {
    queue.push({ channel: process.env[`CHANNEL_${ctx.session.pais}`], msg });
  } else {
    queue.push({ channel: process.env.CHANNEL_GLOBAL, msg });
  }

  for (const item of queue) {
    if (item.channel) {
      await supabase.from("message_queue").insert([{ 
        id: uuidv4(), channel: item.channel, msg: item.msg, fileid, 
        type: ctx.message.video ? "video" : "photo", status: "pending" 
      }]);
    }
  }

  ctx.session.state = "IDLE";
  return ctx.reply(`✅ Reporte enviado con éxito. ¡Has ascendido a **${nuevoRol}**!`, menu());
}

/* ===============================
   🕹️ COMANDOS & IA
=============================== */
bot.hears("👤 Perfil", (ctx) => {
  const u = ctx.state.user;
  const r = String(ctx.from.id) === ADMIN_ID ? "👑 Comandante" : u.rol;
  ctx.reply(`👤 *AGENTE:* ${esc(ctx.from.first_name)}\n🎖️ *RANGO:* ${esc(r)}\n📊 *REPORTES:* ${u.reportes}`, { parse_mode: "MarkdownV2" });
});

bot.hears("🗺️ Ver Mapa", (ctx) => ctx.reply("🌐 Radar Táctico Online:\nhttps://aifucito5-0.onrender.com"));

bot.on(["text", "photo", "video"], async (ctx, next) => {
  const state = ctx.session?.state || "IDLE";
  if (["❌ Cancelar", "/cancel"].includes(ctx.message?.text)) { ctx.session.state = "IDLE"; return ctx.reply("🛰️ Abortado.", menu()); }
  if (state === "WAIT_GPS") return ctx.reply("⚠️ Debes enviar la ubicación por GPS.");
  if (state === "WAIT_DESC") return stepReport(ctx);
  if (state === "IA_CHAT") return ctx.reply(await runAI(ctx.message.text, ctx));
  return next();
});

// IA Rioplatense
async function runAI(text, ctx) {
  try {
    const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, 
      { contents: [{ parts: [{ text: `Sos AIFUCITO IA, uruguaya. Respuesta corta, rioplatense (bo, mate), mística OVNI. Pregunta: ${text}` }] }] });
    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || "📡 Sin señal.";
  } catch { return "⚠️ Interferencia temporal IA."; }
}

// Worker de Mensajes
async function processQueue() {
  try {
    const { data: item } = await supabase.rpc("get_and_lock_message");
    if (item) {
      const method = item.fileid ? (item.type === "video" ? "sendVideo" : "sendPhoto") : "sendMessage";
      await bot.telegram[method](item.channel, item.fileid || item.msg, item.fileid ? { caption: item.msg, parse_mode: "MarkdownV2" } : { parse_mode: "MarkdownV2" });
      await supabase.from("message_queue").update({ status: "sent" }).eq("id", item.id);
    }
  } catch (e) {}
  setTimeout(processQueue, 1500);
}

/* ===============================
   LANZAMIENTO WEBHOOK (RENDER STARTER)
=============================== */
const PORT = process.env.PORT || 3000;
app.use(bot.webhookCallback(`/telegraf/${bot.token}`));
bot.telegram.setWebhook(`https://aifucito5-0.onrender.com/telegraf/${bot.token}`)
  .then(() => console.log("🛰️ WEBHOOK SINCRONIZADO"))
  .catch(err => console.error("❌ ERROR WEBHOOK:", err));

app.listen(PORT, () => {
  console.log(`🛸 RADAR OMEGA V6.0 ONLINE`);
  processQueue();
});
