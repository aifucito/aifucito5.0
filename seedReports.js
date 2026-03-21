import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// zona base (Montevideo + región)
const baseLat = -34.9;
const baseLng = -56.2;

function random(min, max) {
  return Math.random() * (max - min) + min;
}

async function seed() {
  const reports = [];

  for (let i = 0; i < 70; i++) {
    reports.push({
      user_id: "seed-system",
      lat: baseLat + random(-5, 5),
      lng: baseLng + random(-5, 5),
      descripcion: "evento simulado automático",
      pais: ["UY", "AR", "BR", "CL"][Math.floor(Math.random() * 4)],
      rango: Math.floor(Math.random() * 3) + 1,
      precision: Math.floor(Math.random() * 3) + 1,
      tipo: "simulado",
      alerta_generada: false,
    });
  }

  const { error } = await supabase.from("reportes").insert(reports);

  if (error) {
    console.log("ERROR:", error.message);
  } else {
    console.log("70 reportes creados correctamente");
  }
}

seed();
