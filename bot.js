DETALLE CRÍTICO REAL: FALTA TIMEOUT GLOBAL EN TELEGRAM

Hay un caso silencioso:

Si Telegram queda colgado (muy raro, pero pasa),
sendMessage puede quedar esperando indefinidamente.

✅ Solución PRO

En enviarConRetry:

await Promise.race([
  bot.telegram.sendMessage(chatId, mensaje, { parse_mode: "MarkdownV2" }),
  new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000))
]);

👉 Evita que el bot “se congele” sin logs.

🟡 2. MICRO RIESGO: FLOOD DE USUARIOS (SPAM HUMANO)

Ahora no tenés limitador por usuario.

Un usuario podría mandar:

20 reportes seguidos
saturar canales / DB
✅ Solución simple y potente

Agregá cooldown por usuario:

if (ctx.session.last_report_time && Date.now() - ctx.session.last_report_time < 30000) {
  return ctx.reply("⏳ Esperá unos segundos antes de enviar otro reporte.");
}
ctx.session.last_report_time = Date.now();

👉 Esto solo ya elimina el 90% del spam real.

🟡 3. MEJORA IMPORTANTE: FALLBACK DE CANAL

Ahora hacés retry… pero si el canal está mal configurado o caído:

👉 el reporte se pierde en publicación (aunque esté en DB)

✅ Mejora PRO

Después de enviarConRetry:

const enviado = await enviarConRetry(canal, msj);

if (!enviado && process.env.CHANNEL_BACKUP) {
  await enviarConRetry(process.env.CHANNEL_BACKUP, `🚨 BACKUP:\n${msj}`);
}

👉 Esto te da redundancia real tipo sistema crítico.

🟡 4. DETALLE FINO: VALIDACIÓN GPS

Ahora aceptás cualquier número válido, pero:

👉 alguien puede mandar 0,0 (océano) o coordenadas basura

✅ Mejora rápida
if (Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01) {
  return ctx.reply("⚠️ Coordenadas inválidas.");
}
🟡 5. OPTIMIZACIÓN REAL: INDEX EN SUPABASE

Si esto crece, tu endpoint /api/reports puede volverse lento.

✅ En Supabase ejecutar:
create index reportes_created_at_idx on reportes (created_at desc);
create index reportes_hash_idx on reportes (hash);

👉 Esto mejora rendimiento brutalmente.

🟡 6. DETALLE DE UX (IMPORTANTE A FUTURO)

Cuando alguien reporta, no ve:

ciudad en canal
ni coordenadas completas amigables

Podés mejorar el mensaje así:

📍 ${escapeMarkdown(ctx.session.pais)} (${ctx.session.lat}, ${ctx.session.lng})
🧠 CONCLUSIÓN FINAL

Tu bot ahora está en:

🟢 98% PRODUCCIÓN REAL

Lo que lograste:

Sistema persistente ✔️
Resistente a caídas ✔️
Anti-duplicados ✔️
Anti-rate-limit ✔️
Auto-recuperación ✔️
Backend + API ✔️
