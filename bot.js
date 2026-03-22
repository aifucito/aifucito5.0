import "dotenv/config";
import { Telegraf, session, Markup } from "telegraf";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { v4 as uuidv4 } from "uuid";
import express from "express";
import axios from "axios";

const app = express();
const PORT = process.env.PORT || 10000;
app.get("/", (req, res) => res.send("🛰️ NODO AIFU V8.8 - OPERATIVO"));
app.listen(PORT, () => console.log(`🚀 Puerto ${PORT} activo.`));

// Clientes Core
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const bot = new Telegraf(process.env.BOT_TOKEN);

// 🧠 MODELO IA (CORREGIDO: Usamos "gemini-1.5-flash" sin el beta del test)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const aiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// =====================================================
// 🔍 DIAGNÓSTICO RÁPIDO (SOLO LO QUE IMPORTA)
// =====================================================
async function quickCheck() {
  console.log("--- 🛸 ESCANEO DE SISTEMAS CRÍTICOS ---");
  const core = ["BOT_TOKEN", "SUPABASE_URL", "GEMINI_API_KEY", "CHANNEL_CONOSUR"];
  core.forEach(v => console.log(process.env[v] ? `✅ [${v}]: DETECTADA` : `❌ [${v}]: ERROR`));
  
  try {
    const result = await aiModel.generateContent("Hola");
    if (result) console.log("✅ GÉMINIS: Conexión establecida.");
  } catch (e) {
    console.log("⚠️ GÉMINIS: Reintentando conexión en el primer chat...");
  }
}
quickCheck();

// ... (Aquí sigue el resto del código V8.8 con los rangos y reportes que te pasé antes)
