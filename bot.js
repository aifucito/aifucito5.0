/**
 * ==================================================================================
 * 🛰️ AIFUCITO 5.0 - NODO CENTRAL DEFINITIVO
 * SISTEMA DE INVESTIGACIÓN DE FENÓMENOS AÉREOS
 * ==================================================================================
 */

import { Telegraf, Markup, session } from "telegraf";
import express from "express";
import fs from "fs";
import crypto from "crypto";

const fsPromises = fs.promises;

/* =================================================================================
CONFIGURACIÓN
================================================================================= */

const TOKEN = process.env.BOT_TOKEN || "8701174108:AAFgEE-uSZlDvrTNm_QIeDIINqmnCzQIOCM";
const PORT = process.env.PORT || 10000;

const CANAL_CENTRAL = "-1002388657640";
const PUBLIC_URL = "https://aifucito5-0.onrender.com";

const DB_PATH = "./aifucito_db.json";
const BRAIN_PATH = "./brain.json";
const LOG_PATH = "./aifucito_logs.txt";

/* =================================================================================
BASE DE DATOS
================================================================================= */

let DB = {
    agentes: {},
    reportes: [],
    historias: [],
    admins_centrales: [742615432]
};

let BRAIN = {
    vocabulario: {
        hola: "Nodo AIFUCITO activo. ¿Qué fenómeno deseas analizar?",
        ovni: "Los OVNI o UAP son fenómenos aéreos no identificados reportados globalmente.",
        luna: "La Luna presenta anomalías gravitacionales detectadas por misiones Apollo.",
        nasa: "La NASA ha publicado reportes oficiales sobre UAP desde 2023.",
        roswell: "Incidente ocurrido en 1947 en Nuevo México.",
        radar: "El radar global registra reportes enviados por los agentes.",
        biblioteca: "Las historias VIP guardan testimonios de agentes del sistema."
    }
};

/* =================================================================================
LOGS
================================================================================= */

function registrarLog(msg) {

    const log = `[${new Date().toLocaleString()}] ${msg}\n`;

    try {
        fs.appendFileSync(LOG_PATH, log);
    } catch {}
}

/* =================================================================================
PERSISTENCIA
================================================================================= */

function inicializarBases() {

    try {

        if (fs.existsSync(DB_PATH)) {
            DB = JSON.parse(fs.readFileSync(DB_PATH));
        }

        if (fs.existsSync(BRAIN_PATH)) {
            BRAIN = JSON.parse(fs.readFileSync(BRAIN_PATH));
        }

        registrarLog("BASES CARGADAS");

    } catch (e) {

        registrarLog("ERROR AL CARGAR BASES");

    }

}

async function guardarTodo() {

    try {

        await fsPromises.writeFile(DB_PATH, JSON.stringify(DB, null, 2));
        await fsPromises.writeFile(BRAIN_PATH, JSON.stringify(BRAIN, null, 2));

    } catch {

        registrarLog("ERROR AL GUARDAR BASES");

    }

}

inicializarBases();

/* =================================================================================
BOT TELEGRAM
================================================================================= */

const bot = new Telegraf(TOKEN);

bot.use(session());

bot.use((ctx, next) => {

    if (!ctx.session) {
        ctx.session = {};
    }

    return next();

});

/* =================================================================================
MENÚ PRINCIPAL
================================================================================= */

function menuPrincipal() {

    return Markup.keyboard([
        ["🛸 REPORTAR AVISTAMIENTO", "🌍 MAPA GLOBAL"],
        ["🤖 CHARLAR CON AIFUCITO", "⭐ MI PERFIL"],
        ["📚 HISTORIAS VIP"]
    ]).resize();

}

/* =================================================================================
COMANDO START
================================================================================= */

bot.start(async (ctx) => {

    const id = ctx.from.id;

    if (!DB.agentes[id]) {

        DB.agentes[id] = {
            id,
            nombre: ctx.from.first_name,
            xp: 100,
            reportes_totales: 0
        };

        await guardarTodo();

    }

    ctx.reply(
        "🛰️ NODO AIFUCITO 5.0 OPERATIVO\nAcceso del agente verificado.",
        menuPrincipal()
    );

});

/* =================================================================================
BOTONES
================================================================================= */

bot.hears("🛸 REPORTAR AVISTAMIENTO", (ctx) => {

    ctx.session.reporte = { paso: "tipo" };

    ctx.reply("Describe el tipo de objeto observado:");

});

bot.hears("🌍 MAPA GLOBAL", (ctx) => {

    ctx.reply(`${PUBLIC_URL}/radar`);

});

bot.hears("🤖 CHARLAR CON AIFUCITO", (ctx) => {

    ctx.session.chat = true;

    ctx.reply("Modo conversación activado. Escribe SALIR para terminar.");

});

bot.hears("⭐ MI PERFIL", (ctx) => {

    const user = DB.agentes[ctx.from.id];

    if (!user) return;

    ctx.reply(
        `AGENTE: ${user.nombre}
XP: ${user.xp}
REPORTES: ${user.reportes_totales}`
    );

});

bot.hears("📚 HISTORIAS VIP", (ctx) => {

    ctx.reply(
        "Biblioteca de testimonios",
        Markup.inlineKeyboard([
            [Markup.button.callback("Leer historias", "ver_hist")],
            [Markup.button.callback("Escribir historia", "escribir_hist")]
        ])
    );

});

/* =================================================================================
ACCIONES INLINE
================================================================================= */

bot.action("ver_hist", (ctx) => {

    if (DB.historias.length === 0) {

        ctx.reply("No hay historias registradas.");

        return;
    }

    let texto = "ULTIMAS HISTORIAS\n\n";

    DB.historias.slice(-5).forEach((h) => {

        texto += `"${h.texto}"\nAutor: ${h.autor}\n\n`;

    });

    ctx.reply(texto);

});

bot.action("escribir_hist", (ctx) => {

    ctx.session.escribiendo_historia = true;

    ctx.reply("Escribe tu historia:");

});

/* =================================================================================
MENSAJES DE TEXTO
================================================================================= */

bot.on("text", async (ctx) => {

    const texto = ctx.message.text.toLowerCase();

    const uid = ctx.from.id;

    if (texto === "salir") {

        ctx.session = {};

        ctx.reply("Sesión cerrada.", menuPrincipal());

        return;

    }

    if (ctx.session.escribiendo_historia) {

        DB.historias.push({
            autor: ctx.from.first_name,
            texto: ctx.message.text,
            fecha: new Date().toLocaleDateString()
        });

        ctx.session.escribiendo_historia = false;

        await guardarTodo();

        ctx.reply("Historia guardada.", menuPrincipal());

        return;

    }

    if (ctx.session.reporte) {

        if (ctx.session.reporte.paso === "tipo") {

            ctx.session.reporte.tipo = ctx.message.text;

            ctx.session.reporte.paso = "ubicacion";

            ctx.reply("Indica ubicación:");

            return;

        }

        if (ctx.session.reporte.paso === "ubicacion") {

            const id = crypto.randomBytes(3).toString("hex");

            DB.reportes.push({
                id,
                agente: ctx.from.first_name,
                tipo: ctx.session.reporte.tipo,
                ubicacion: ctx.message.text,
                fecha: new Date().toLocaleString()
            });

            if (DB.agentes[uid]) {

                DB.agentes[uid].reportes_totales++;
                DB.agentes[uid].xp += 50;

            }

            ctx.session.reporte = null;

            await guardarTodo();

            try {

                await ctx.telegram.sendMessage(
                    CANAL_CENTRAL,
                    `REPORTE OVNI
Agente: ${ctx.from.first_name}
Tipo: ${ctx.session?.reporte?.tipo}
Ubicación: ${ctx.message.text}`
                );

            } catch {}

            ctx.reply("Reporte guardado.", menuPrincipal());

            return;

        }

    }

    if (ctx.session.chat) {

        for (const palabra in BRAIN.vocabulario) {

            if (texto.includes(palabra)) {

                ctx.reply(BRAIN.vocabulario[palabra]);

                return;

            }

        }

        ctx.reply("No hay datos sobre eso.");

    }

});

/* =================================================================================
SERVIDOR WEB
================================================================================= */

const app = express();

app.get("/", (req, res) => {

    res.send("AIFUCITO ONLINE");

});

app.get("/radar", (req, res) => {

    res.json(DB.reportes);

});

/* =================================================================================
ARRANQUE
================================================================================= */

bot.launch()
.then(() => {

    console.log("BOT TELEGRAM CONECTADO");

})
.catch((err) => {

    console.log("ERROR BOT:", err);

});

app.listen(PORT, () => {

    console.log("SERVIDOR WEB ACTIVO");

});

/* =================================================================================
SEGURIDAD DE CIERRE
================================================================================= */

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
