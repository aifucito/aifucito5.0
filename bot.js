// ===============================
// 🔥 AIFU BOT V6.5 FINAL (FULL)
// ===============================

import "dotenv/config";
import { Telegraf, Markup } from "telegraf";
import axios from "axios";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";

// ===============================
// 0. ANTIFRAGIL GLOBAL
// ===============================
process.on("uncaughtException", (e) => console.error("🔥 CRASH:", e.message));
process.on("unhandledRejection", (e) => console.error("🔥 PROMISE:", e?.message));

// ===============================
// 1. CONFIG
// ===============================
const REQ = [
  "BOT_TOKEN","SUPABASE_URL","SUPABASE_KEY","GEMINI_API_KEY",
  "CHANNEL_UY","CHANNEL_AR","CHANNEL_CL","CHANNEL_CONO_SUR","CHANNEL_BACKUP"
];
REQ.forEach(v => { if (!process.env[v]) { console.error("❌ FALTA:", v); process.exit(1);} });

const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const ADMIN_ID = String(process.env.ADMIN_ID);
const app = express();

const STATE = { IDLE:"idle", WAIT_GPS:"wait_gps", WAIT_DESC:"wait_desc", IA:"ia" };
let botActivo = false;
let lastHeartbeat = Date.now();

const CANALES = {
  UY: process.env.CHANNEL_UY,
  AR: process.env.CHANNEL_AR,
  CL: process.env.CHANNEL_CL,
  GLOBAL: process.env.CHANNEL_CONO_SUR
};

// ===============================
// 2. UTILIDADES
// ===============================
const esc = (t)=> t? t.replace(/[_*\[\]()~`>#+=|{}.!-]/g,"\\$&") : "";

function rango(n = 0, id = "") {
  if (String(id) === ADMIN_ID) return "👑 Comandante Intergaláctico";
  if (n >= 25) return "🛸 Experto CRIDOVNI";
  if (n >= 15) return "🛰️ Centinela del Espacio";
  if (n >= 10) return "🧉 Cebador del mate del Área 51";
  if (n >= 5)  return "💂 Guardaespaldas de Alf";
  if (n >= 2)  return "🚽 Fajinador espacial";
  return "🔭 Observador Civil";
}

async function enviarConRetry(chatId, msj, intentos=3){
  for(let i=0;i<intentos;i++){
    try{
      await bot.telegram.sendMessage(chatId, msj, {parse_mode:"MarkdownV2"});
      return true;
    }catch(e){
      if(e.response?.error_code===429){
        const wait=e.response.parameters?.retry_after||5;
        await new Promise(r=>setTimeout(r,wait*1000)); i--; continue;
      }
      await new Promise(r=>setTimeout(r,2000));
    }
  }
  return false;
}

async function enviarConBackup(canal, msj){
  const ok = await enviarConRetry(canal, msj);

  if(!ok){
    await enviarConRetry(process.env.CHANNEL_BACKUP, `🚨 FALLÓ PUBLICACIÓN\n\n${msj}`);
  }

  // backup SIEMPRE
  await enviarConRetry(process.env.CHANNEL_BACKUP, `🗄 BACKUP\n\n${msj}`);

  return ok;
}

// ===============================
// 3. API + KEEP ALIVE
// ===============================
app.get("/ping", (req,res)=>res.send("OK"));

app.get("/api/reports", async (req,res)=>{
  try{
    const limit = Math.min(parseInt(req.query.limit)||100,200);
    const {data}=await supabase.from("reportes").select("*").order("created_at",{ascending:false}).limit(limit);
    res.json(data||[]);
  }catch{res.json([])}
});

app.listen(process.env.PORT||3000,"0.0.0.0");

// ===============================
// 4. IA
// ===============================
async function hablarIA(text,nombre,r){
  try{
    const prompt=`Eres AIFUCITO. Usuario:${nombre}. Rango:${r}. Responde breve.`;
    const rta=await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {contents:[{parts:[{text:prompt+" "+text}]}]},{timeout:8000});
    return rta.data?.candidates?.[0]?.content?.parts?.[0]?.text||"👽 Sin señal";
  }catch{return"📡 Error IA"}
}

// ===============================
// 5. SESIÓN
// ===============================
bot.use(async (ctx,next)=>{
  lastHeartbeat=Date.now();
  if(!ctx.from?.id) return;
  const id=String(ctx.from.id);
  try{
    const {data}=await supabase.from("sesiones").select("data").eq("id",id).maybeSingle();
    ctx.session=data?.data||{state:STATE.IDLE,last_activity:Date.now()};

    if(Date.now()-ctx.session.last_activity>600000){
      ctx.session.state=STATE.IDLE;
      delete ctx.session.sending;
    }

    ctx.session.last_activity=Date.now();
    await next();

    await supabase.from("sesiones").upsert({id,data:ctx.session,updated_at:new Date()});

  }catch{ctx.session={state:STATE.IDLE}; await next();}
});

// ===============================
// 6. UI
// ===============================
const menu=()=>Markup.keyboard([["📍 Reportar"],["🤖 Aifucito","👤 Perfil"]]).resize();

bot.start(async ctx=>{
  await supabase.from("usuarios").upsert({id:String(ctx.from.id),nombre:ctx.from.first_name});
  ctx.reply("🛸 RED AIFU ONLINE",menu());
});

bot.hears("👤 Perfil", async ctx=>{
  const {data:u}=await supabase.from("usuarios").select("*").eq("id",String(ctx.from.id)).maybeSingle();
  ctx.reply(`👤 ${esc(u?.nombre)}\n🎖 ${esc(rango(u?.reportes||0,ctx.from.id))}\n📊 ${u?.reportes||0}`,{parse_mode:"MarkdownV2"});
});

bot.hears("🤖 Aifucito",ctx=>{
  ctx.session.state=STATE.IA;
  ctx.reply("🤖 Pregunta lo que quieras",{parse_mode:"MarkdownV2"});
});

// ===============================
// 7. GEO
// ===============================
async function geo(lat,lng){
  try{
    const r=await axios.get("https://nominatim.openstreetmap.org/reverse",{params:{format:"json",lat,lon:lng},headers:{"User-Agent":"AIFU"}});
    const a=r.data.address;
    const p=a?.country_code?.toUpperCase();
    return{pais:["UY","AR","CL"].includes(p)?p:"UY",ciudad:a?.city||a?.town||"Zona"};
  }catch{return{pais:"UY",ciudad:"Remoto"}}
}

// ===============================
// 8. REPORTES
// ===============================
bot.hears("📍 Reportar",ctx=>{
  if(ctx.session.last_report_time && Date.now()-ctx.session.last_report_time<45000)
    return ctx.reply("⏳ Espera");
  ctx.session.state=STATE.WAIT_GPS;
  ctx.reply("📡 Enviar GPS",Markup.keyboard([[Markup.button.locationRequest("📍 GPS")],["❌ Cancelar"]]).resize());
});

bot.on("location",async ctx=>{
  if(ctx.session.state!==STATE.WAIT_GPS) return;
  ctx.session.lat=ctx.message.location.latitude;
  ctx.session.lng=ctx.message.location.longitude;
  const g=await geo(ctx.session.lat,ctx.session.lng);
  ctx.session.pais=g.pais; ctx.session.ciudad=g.ciudad;
  ctx.session.state=STATE.WAIT_DESC;
  ctx.reply(`📍 ${esc(g.ciudad)} (${g.pais})\n✍️ Describe`,{parse_mode:"MarkdownV2"});
});

bot.on("text",async(ctx,next)=>{
  const t=ctx.message.text;
  const id=String(ctx.from.id);

  if(t==="❌ Cancelar"){ctx.session.state=STATE.IDLE; return ctx.reply("🚫",menu());}

  if(ctx.session.state===STATE.IA){
    const {data:u}=await supabase.from("usuarios").select("reportes").eq("id",id).maybeSingle();
    const r=rango(u?.reportes||0,id);
    const resp=await hablarIA(t,ctx.from.first_name,r);
    ctx.session.state=STATE.IDLE;
    return ctx.reply(`🤖 ${esc(resp)}`,{parse_mode:"MarkdownV2",...menu()});
  }

  if(ctx.session.state===STATE.WAIT_DESC){
    if(t.length<5) return ctx.reply("Muy corto");
    if(ctx.session.sending) return;

    const hash=`${id}-${t.slice(0,15)}-${Math.floor(Date.now()/60000)}`;
    if(ctx.session.last_hash===hash) return;

    try{
      ctx.session.sending=true;

      await Promise.race([
        supabase.from("reportes").insert([{id:uuidv4(),user_id:id,lat:ctx.session.lat,lng:ctx.session.lng,descripcion:t,pais:ctx.session.pais,hash}]),
        new Promise((_,r)=>setTimeout(()=>r(new Error("timeout")),7000))
      ]);

      const {data:user}=await supabase.from("usuarios").select("reportes").eq("id",id).maybeSingle();
      await supabase.from("usuarios").upsert({id,nombre:ctx.from.first_name,reportes:(user?.reportes||0)+1});

      const msj=`🛸 *AVISTAMIENTO*\n\n📍 ${esc(ctx.session.ciudad)} (${ctx.session.pais})\n👤 ${esc(ctx.from.first_name)}\n📝 ${esc(t)}`;

      await enviarConBackup(CANALES[ctx.session.pais],msj);
      await enviarConBackup(CANALES.GLOBAL,`🌎 *RED*\n${msj}`);

      ctx.session.last_report_time=Date.now();
      ctx.session.last_hash=hash;
      ctx.session.state=STATE.IDLE;

      return ctx.reply("✅ Enviado",{parse_mode:"MarkdownV2",...menu()});

    }catch(e){
      await supabase.from("backup_reportes").insert([{user_id:id,contenido:t}]);
      return ctx.reply("⚠️ Guardado backup");
    }finally{delete ctx.session.sending}
  }

  return next();
});

// ===============================
// 9. WATCHDOG
// ===============================
async function iniciarBot(){
  try{
    try{await bot.stop();}catch{}
    await bot.launch({dropPendingUpdates:true});
    botActivo=true;
    console.log("🟢 ONLINE");
  }catch{setTimeout(iniciarBot,5000)}
}

setInterval(async()=>{
  try{
    await bot.telegram.getMe();
    if(botActivo && Date.now()-lastHeartbeat>120000){botActivo=false; await iniciarBot();}
  }catch{botActivo=false; await iniciarBot();}
},60000);

bot.catch(err=>console.error("🔥",err.message));
iniciarBot();
