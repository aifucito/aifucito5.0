import "dotenv/config";
import { Telegraf } from "telegraf";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (req, res) => res.send("🧪 SISTEMA DE PRUEBAS AIFU V9.0 ONLINE"));
app.listen(PORT, () => console.log(`💻 Monitor en puerto ${PORT}`));

// =====================================================
// 🔍 MAPEO DE VARIABLES (EL "ADN" DEL BOT)
// =====================================================
async function runDiagnostic() {
  console.log("\n--- 🛸 INICIANDO ESCANEO DE VARIANTES ---");

  const mandatoryVars = [
    // Core & Telegram API
    "BOT_TOKEN", "API_ID", "API_HASH", "ADMIN_ID",
    // Canales Regionales
    "CHANNEL_UY", "CHANNEL_AR", "CHANNEL_CL", "CHANNEL_GLOBAL", "CHANNEL_CONOSUR",
    // Seguridad y Backups
    "CHANNEL_BACKUP", "COPIA_DE_SEGURIDAD",
    // IA y Datos
    "GEMINI_API_KEY", "SUPABASE_URL", "SUPABASE_KEY",
    // Servicios Externos
    "LOCATION_IQ_KEY", "PHONE_NUMBER_PUBLIC"
  ];

  let missing = 0;

  mandatoryVars.forEach(v => {
    const value = process.env[v];
    if (!value || value === "undefined" || value === "") {
      console.error(`❌ [${v}]: NO DETECTADA O VACÍA`);
      missing++;
    } else {
      // Validamos formato básico (ejemplo: si los canales tienen el -100)
      const isChannel = v.startsWith("CHANNEL_");
      const hasPrefix = isChannel ? String(value).startsWith("-100") : true;
      
      console.log(`✅ [${v}]: OK ${isChannel && !hasPrefix ? "⚠️ (Falta prefijo -100)" : ""}`);
    }
  });

  // =====================================================
  // ⚡ TEST DE CONEXIÓN REAL (GÉMINIS & SUPABASE)
  // =====================================================
  console.log("\n--- ⚡ PROBANDO INTEGRACIONES ---");

  // Test Supabase
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    const { error } = await supabase.from('reportes').select('id').limit(1);
    if (error) throw error;
    console.log("✅ SUPABASE: Conexión y lectura exitosa.");
  } catch (e) { console.error("❌ SUPABASE: Fallo de conexión ->", e.message); }

  // Test Géminis
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const res = await model.generateContent("Test rápido: responde 'OK'");
    console.log(`✅ GÉMINIS: Conexión establecida.`);
  } catch (e) { console.error("❌ GÉMINIS: Fallo de API ->", e.message); }

  console.log("\n-----------------------------------------");
  console.log(missing === 0 ? "🚀 TODO LISTO PARA EL DESPLIEGUE REAL" : `⚠️ FALTAN ${missing} VARIABLES`);
  console.log("-----------------------------------------\n");
}

runDiagnostic();

// Mantenemos el bot vivo para que Render no dé error de puerto
const bot = new Telegraf(process.env.BOT_TOKEN);
bot.start((ctx) => ctx.reply("🧪 Nodo de prueba activo. Revisá los logs de Render."));
bot.launch();
