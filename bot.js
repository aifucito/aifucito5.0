import "dotenv/config";
import { Telegraf } from "telegraf";
import { createClient } from "@supabase/supabase-js";
import express from "express";

// ⚙️ SERVIDOR PARA QUE RENDER NO SE DUERMA
const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (req, res) => res.send("📡 MÓDULO DE DIAGNÓSTICO AIFU ONLINE"));
app.listen(PORT, () => console.log(`💻 Puerto ${PORT} abierto.`));

// 🛠️ FUNCIÓN DE TESTEO TOTAL
async function testSystem() {
  console.log("-----------------------------------------");
  console.log("🔍 INICIANDO ESCANEO DE SISTEMAS AIFU...");
  console.log("-----------------------------------------");

  const vars = [
    "BOT_TOKEN", "SUPABASE_URL", "SUPABASE_KEY",
    "CHANNEL_AR", "CHANNEL_CL", "CHANNEL_UY", 
    "CHANNEL_GLOBAL", "CHANNEL_CONOSUR"
  ];

  let errores = 0;

  // 1. Comprobar Variables de Entorno
  vars.forEach(v => {
    const val = process.env[v];
    if (!val || val === "undefined") {
      console.error(`❌ ERROR: La variable [${v}] está VACÍA.`);
      errores++;
    } else {
      console.log(`✅ OK: [${v}] detectada (${val.substring(0, 8)}...)`);
    }
  });

  // 2. Comprobar Conexión Supabase
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    const { error } = await supabase.from('usuarios').select('count', { count: 'exact', head: true });
    if (error) throw error;
    console.log("✅ OK: Conexión con Supabase establecida.");
  } catch (e) {
    console.error("❌ ERROR: No se pudo conectar con Supabase:", e.message);
    errores++;
  }

  // 3. Comprobar Bot de Telegram
  try {
    const bot = new Telegraf(process.env.BOT_TOKEN);
    const me = await bot.telegram.getMe();
    console.log(`✅ OK: Bot conectado como @${me.username}`);
    
    // Test de envío al Canal Cono Sur (Solo si existe el ID)
    if (process.env.CHANNEL_CONOSUR) {
        console.log("📡 Intentando mensaje de prueba a CHANNEL_CONOSUR...");
        await bot.telegram.sendMessage(process.env.CHANNEL_CONOSUR, "🛠️ TEST DE SISTEMAS: El Nodo AIFU está iniciando pruebas de comunicación.");
        console.log("✅ OK: Mensaje de prueba enviado exitosamente.");
    }

  } catch (e) {
    console.error("❌ ERROR: Falla en Telegram (Token o Permisos):", e.message);
    errores++;
  }

  console.log("-----------------------------------------");
  if (errores === 0) {
    console.log("🚀 RESULTADO: SISTEMA LISTO PARA OPERAR.");
  } else {
    console.error(`⚠️ RESULTADO: SE ENCONTRARON ${errores} FALLOS CRÍTICOS.`);
  }
  console.log("-----------------------------------------");
}

testSystem();

// Handler mínimo para que no crashee
const bot = new Telegraf(process.env.BOT_TOKEN);
bot.start((ctx) => ctx.reply("🛰️ Módulo de diagnóstico activo. Mirá los logs de Render."));
bot.launch();
