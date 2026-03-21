import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

/* =========================
   CONFIG
========================= */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const app = express();

app.use(cors());
app.use(express.json());

/* =========================
   FRONTEND (PUBLIC)
========================= */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* =========================
   API REPORTES (FILTRO REAL)
========================= */

app.get("/api/reports", async (req, res) => {
  const range = req.query.range || "24h";

  let hours = 24;

  switch (range) {
    case "7d":
      hours = 24 * 7;
      break;
    case "1m":
      hours = 24 * 30;
      break;
    case "3m":
      hours = 24 * 90;
      break;
    case "6m":
      hours = 24 * 180;
      break;
    case "9m":
      hours = 24 * 270;
      break;
    case "1y":
      hours = 24 * 365;
      break;
    default:
      hours = 24;
  }

  const fromDate = new Date(Date.now() - hours * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from("reportes")
    .select("*")
    .gte("created_at", fromDate.toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data || []);
});

/* =========================
   HEALTH CHECK (RENDER)
========================= */

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

/* =========================
   START SERVER
========================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("SERVER ON PORT", PORT);
});
