// ==========================================
// 🌌 AIFU BOT V6.0 - OMEGA HYBRID CORE (TOTAL CONSOLIDATED)
// ==========================================
import "dotenv/config";
import { Telegraf, Markup, session } from "telegraf";
import axios from "axios";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";

// Configuración de rutas para Express y Carpeta Public
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const app = express();
const ADMIN_ID = String(process.env.ADMIN_ID);

/* ===============================
   CONFIGURACIÓN + RANGOS
=============================== */
const RANGOS = [
  { min: 0, name: "🔭 Observador Civil" },
  { min: 2, name: "🚽 Fajinador de retretes espaciales" },
  { min: 5, name: "💂 Guardaespaldas de Alf" },
  { min: 10, name: "🧉 Cebador del mate del Área 51" },
  { min: 15, name: "🛰️ Centinela del Espacio" },
  { min: 25, name: "🛸 Experto CRIDOVNI" }
];

const esc = (t) => t ? String(t).replace(/[_*\[\]()~`>#+=|{}.!-]/g, "\\$&") : "";
const menu = () => Markup.keyboard([["📍 Reportar"], ["🤖 Aifucito", "👤 Perfil"]]).resize();

/* ===============================
   CACHE GEO
=============================== */
const geoCache = new Map();
const CACHE_TTL = 1000 * 60 * 60;
const setGeoCache = (k, v) => geoCache.set(k, { v, t: Date.now() });
const getGeoCache = (k) => {
  const c = geoCache.get(k);
  if (!c) return null;
  if (Date.now() - c.t > CACHE_TTL) { geoCache.delete(k); return null; }
  return c.v;
};

/* ===============================
   SERVIDOR EXPRESS (MAPA WEB & API)
=============================== */
// 1. Habilitar archivos estáticos (CSS, JS del mapa)
app.use(express.static(path.join(__dirname, "public")));

// 2. Ruta Raíz: Abre el Mapa (index.html en /public)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 3. API para el Mapa: Entrega los puntos de Supabase
app.get("/api/reportes", async (req, res) => {
  try {
    const { data } = await supabase
      .from("reportes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 4. Health Check secundario
app.get("/status", (_, res) => res.send("AIFU V6.0 ONLINE"));

app.listen(process.env.PORT || 3000, () => {
  console.log("🛰️ Servidor Web y API de Reportes activos.");
});

/* ===============================
   MIDDLEWARE: SESSION & PERSISTENCIA
=============================== */
bot.use(session());

bot.use(async (ctx, next) => {
  if (!ctx.from?.id) return next();
  const uid = String(ctx.from.id);
  ctx.session ||= { state: "IDLE" };

  try {
    let { data: user } = await supabase.from("usuarios").select("*").eq("id", uid).maybeSingle();
    if (!user) {
      user = { id: uid, nombre: ctx.from.first_name || "Agente", reportes: 0, premium: false };
      await supabase.from("usuarios").insert([user]);
    }
    ctx.state.user = user;

    // Restauración de sesión si el bot se reinició
    if (!ctx.session.state || ctx.session.state === "IDLE") {
      const { data: ses } = await supabase.from("sesiones").select("data").eq("id", uid).maybeSingle();
      if (ses?.data?.state) ctx.session = ses.data;
    }

    await next();

    // Guardar estado actual en la DB
    await supabase.from("sesiones").upsert({ id: uid, data: ctx.session, updated_at: new Date() });
  } catch (e) { console.log("Middleware error:", e.message); return next(); }
});

/* ===============================
   INTELIGENCIA ARTIFICIAL (GEMINI)
=============================== */
async function runAI(text, ctx) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const rango = String(ctx.from.id) === ADMIN_ID ? "👑 Comandante Intergaláctico" : 
                  RANGOS.slice().reverse().find((x) => ctx.state.user.reportes >= x.min)?.name;
    const prompt = `Sos AIFUCITO IA, uruguaya. Usuario: ${ctx.from.first_name}. Rango: ${rango}. Respuesta corta, rioplatense (bo, mate), mística OVNI. Pregunta: ${text}`;
    
    const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, 
      { contents: [{ parts: [{ text: prompt }] }] }, { signal: controller.signal });
    
    clearTimeout(timeout);
    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || "📡 Sin señal.";
  } catch { return "⚠️ Interferencia temporal IA."; }
}

/* ===============================
   RESOLVER GEOLOCALIZACIÓN
=============================== */
async function resolveGeo(txt) {
  const cached = getGeoCache(txt);
  if (cached) return cached;
  try {
    const r = await axios.get("https://nominatim.openstreetmap.org/search", { 
      params: { q: txt, format: "json", limit: 1 }, 
      headers: { "User-Agent": "AIFU-V6" } 
    });
    const d = r.data?.[0];
    if (!d) return null;
    const geo = { lat: parseFloat(d.lat), lng: parseFloat(d.lon), ciudad: d.display_name.split(",")[0], pais: "UY" };
    setGeoCache(txt, geo);
    return geo;
  } catch { return null; }
}

/* ===============================
   ROUTER DE ESTADOS (MAQUINA DE ESTADOS)
=============================== */
bot.on(["text", "location", "photo", "video"], async (ctx, next) => {
  const state = ctx.session?.state || "IDLE";
  if (["❌ Cancelar", "/cancel"].includes(ctx.message?.text)) {
    ctx.session.state = "IDLE";
    return ctx.reply("🛰️ Abortado.", menu());
  }
  const map = { WAIT_GPS: stepGPS, WAIT_DESC: stepReport, IA_CHAT: stepAI };
  if (map[state]) return map[state](ctx);
  return next();
});

/* ===============================
   PASOS DEL REPORTE
=============================== */
async function stepGPS(ctx) {
  let geo = ctx.message.location ? 
    { lat: ctx.message.location.latitude, lng: ctx.message.location.longitude, ciudad: "GPS", pais: "UY" } : 
    await resolveGeo(ctx.message.text);
  
  if (!geo) return ctx.reply("❌ No se pudo ubicar la zona. Escribí una ciudad válida.");
  ctx.session = { ...ctx.session, ...geo, state: "WAIT_DESC" };
  return ctx.reply("🛰️ Zona fijada. Describí el evento o enviá una foto/video:");
}

async function stepReport(ctx) {
  const desc = ctx.message.text || ctx.message.caption || "Sin descripción";
  const fileid = ctx.message.photo?.pop()?.file_id || ctx.message.video?.file_id;
  
  // Guardar en Supabase
  await supabase.from("reportes").insert([{ 
    id: uuidv4(), 
    user_id: String(ctx.from.id), 
    lat: ctx.session.lat,
    lng: ctx.session.lng,
    ciudad: ctx.session.ciudad,
    pais: ctx.session.pais,
    descripcion: desc, 
    file_id: fileid 
  }]);
  
  await supabase.rpc("increment_report_count", { user_id_param: String(ctx.from.id) });

  const msg = `🛸 *REPORTE*\n📍 ${esc(ctx.session.ciudad)}\n👤 ${esc(ctx.from.first_name)}\n📝 ${esc(desc)}`;
  const channels = [process.env.CHANNEL_GLOBAL, process.env[`CHANNEL_${ctx.session.pais}`]];
  
  // Encolar mensajes para los canales
  for (const c of channels) {
    if (c) await supabase.from("message_queue").insert([{ 
      id: uuidv4(), channel: c, msg, fileid, 
      type: ctx.message.video ? "video" : "photo", status: "pending" 
    }]);
  }

  ctx.session.state = "IDLE";
  return ctx.reply("✅ Reporte enviado con éxito.", menu());
}

async function stepAI(ctx) { 
  ctx.reply(await runAI(ctx.message.text || "", ctx)); 
}

/* ===============================
   WORKER: PROCESADOR DE COLA (QUEUE)
=============================== */
async function processQueue() {
  try {
    const { data: item } = await supabase.rpc("get_and_lock_message");
    if (item) {
      try {
        const method = item.fileid ? (item.type === "video" ? "sendVideo" : "sendPhoto") : "sendMessage";
        const payload = item.fileid ? 
          [item.channel, item.fileid, { caption: item.msg, parse_mode: "MarkdownV2" }] : 
          [item.channel, item.msg, { parse_mode: "MarkdownV2" }];
        
        await bot.telegram[method](...payload);
        await supabase.from("message_queue").update({ status: "sent" }).eq("id", item.id);
      } catch {
        await supabase.from("message_queue").update({ status: "pending", attempts: (item.attempts || 0) + 1 }).eq("id", item.id);
      }
    }
  } catch (e) { console.log("Queue error:", e?.message); }
  setTimeout(processQueue, 1500);
}

/* ===============================
   COMANDOS PRINCIPALES
=============================== */
bot.start((ctx) => ctx.reply("🛸 AIFU V6.0 ONLINE\nBienvenido Agente.", menu()));

bot.hears("📍 Reportar", (ctx) => {
  ctx.session.state = "WAIT_GPS";
  ctx.reply("📡 Enviá ubicación o escribí la ciudad:", Markup.keyboard([[Markup.button.locationRequest("📍 GPS")], ["❌ Cancelar"]]).resize());
});

bot.hears("🤖 Aifucito", (ctx) => { 
  ctx.session.state = "IA_CHAT"; 
  ctx.reply("🤖 IA activada. ¿En qué te ayudo, bo?"); 
});

bot.hears("👤 Perfil", (ctx) => {
  const r = String(ctx.from.id) === ADMIN_ID ? "👑 Comandante Intergaláctico" : 
            RANGOS.slice().reverse().find((x) => ctx.state.user.reportes >= x.min)?.name;
  ctx.reply(`👤 *AGENTE:* ${esc(ctx.from.first_name)}\n🎖️ *RANGO:* ${esc(r)}\n📊 *REPORTES:* ${ctx.state.user.reportes}`, { parse_mode: "MarkdownV2" });
});

bot.command("radar", async (ctx) => {
  if (String(ctx.from.id) !== ADMIN_ID) return;
  const { count: u } = await supabase.from("usuarios").select("*", { count: "exact", head: true });
  const { count: r } = await supabase.from("reportes").select("*", { count: "exact", head: true });
  const { count: q } = await supabase.from("message_queue").select("*", { count: "exact", head: true }).eq("status", "pending");
  ctx.reply(`🛡️ **PANEL OMEGA V6.0**\n\n👥 Agentes: ${u}\n🛸 Reportes: ${r}\n📦 En cola: ${q}\n🟢 Sistema OK`);
});

/* ===============================
   LANZAMIENTO
=============================== */
bot.launch();
processQueue();
console.log("🛸 AIFU V6.0 HYBRID CORE ONLINE - SISTEMA DE RADAR WEB ACTIVADO");
