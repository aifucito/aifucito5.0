// utils/categorias.js
export function detectarCategoria(texto) {
  // Función mínima de prueba
  // Detecta categorías básicas por palabras clave
  const t = texto.toLowerCase();
  if (t.includes('ovni')) return 'OVNI';
  if (t.includes('luz')) return 'Fenómeno Luminoso';
  if (t.includes('sonido')) return 'Fenómeno Sonoro';
  return 'Otro';
}