/* ==========================================
   🚀 MEJORA DE FLUJO (REEMPLAZA TU bot.on("text"))
========================================== */
bot.on("text", async (ctx) => {
  const id = String(ctx.from.id);
  const text = ctx.message.text;

  // 1. Evitar que los botones del menú disparen la lógica de "texto de reporte"
  const botonesMenu = ["📍 Iniciar Reporte", "🛰️ Ver Radar", "👤 Mi Perfil", "🤖 Hablar con Aifucito", "🤝 Hacerse Colaborador", "⬅️ Menú"];
  if (botonesMenu.includes(text)) return;

  const user = await getProfile(id);
  if (!user) return;

  // Lógica de IA (Si el estado es IA_CHAT)
  if (user.state === "IA_CHAT") {
    // Si no es premium, chequear límite
    if (!user.is_premium && (user.ai_count || 0) >= 3) {
      return ctx.reply("🚫 Has agotado tus 3 consultas gratuitas, tú. Hacete colaborador para seguir.");
    }

    try {
      await ctx.sendChatAction("typing");
      // Prompt mejorado para asegurar respuesta
      const prompt = `Actúa como Aifucito, un experto en OVNIs uruguayo. Sé amable y usa modismos orientales. Pregunta de ${ctx.from.first_name}: ${text}`;
      const result = await aiModel.generateContent(prompt);
      const response = await result.response;
      
      // Actualizar contador de IA
      await updateSession(id, { ai_count: (user.ai_count || 0) + 1 });
      return ctx.reply(`🛸 **Aifucito:** ${response.text()}`);
    } catch (e) {
      console.error("Error IA:", e);
      return ctx.reply("⚠️ Interferencia en la señal IA. Probá de nuevo en un ratito.");
    }
  }

  // Lógica de Reporte (Si el estado es WAITING_DESC)
  if (user.state === "WAITING_DESC") {
    try {
      const reportId = uuidv4();
      await supabase.from("reportes").insert({
        id: reportId, 
        user_id: id, 
        lat: user.lat, 
        lng: user.lng, 
        ciudad: user.ciudad, 
        pais: user.pais, 
        descripcion: text, 
        created_at: new Date().toISOString()
      });
      
      const alerta = `🚨 **NUEVO REPORTE**\n📍 ${user.ciudad} (${user.pais})\n👤 Agente: ${ctx.from.first_name}\n📝 ${text}`;
      
      // Envíos a canales (con manejo de errores individual)
      const chDestino = CHANNELS[user.pais] || CHANNELS.GLOBAL;
      if (chDestino) bot.telegram.sendMessage(chDestino, alerta).catch(() => {});
      if (CHANNELS.CONOSUR) bot.telegram.sendMessage(CHANNELS.CONOSUR, alerta).catch(() => {});

      await updateSession(id, { state: "IDLE", xp: (user.xp || 0) + 25 });
      return ctx.reply("✅ **Recibido.** Reporte sincronizado en el mapa neón. +25 XP", menu);
    } catch (err) {
      console.error("Error guardando reporte:", err);
      return ctx.reply("❌ Error al guardar el reporte en la base de datos.");
    }
  }

  // Si no está en ningún estado especial, responder por defecto
  ctx.reply("🛸 Usá los botones del menú para operar el sistema, Agente.", menu);
});
