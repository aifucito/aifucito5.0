const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

const DATA_FILE = path.join(__dirname, 'data', 'reportes.json');

/* =================================
   CLIENTES DEL RADAR EN VIVO
================================= */

let radarClientes = [];

/* =================================
   CANAL RADAR EN VIVO
================================= */

app.get('/api/live', (req, res) => {

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    res.flushHeaders();

    radarClientes.push(res);

    req.on('close', () => {
        radarClientes = radarClientes.filter(c => c !== res);
    });

});

/* =================================
   ENVIAR EVENTO AL RADAR
================================= */

function emitirRadar(reporte){

    const data = `data: ${JSON.stringify(reporte)}\n\n`;

    radarClientes.forEach(cliente=>{
        try{
            cliente.write(data);
        }catch{}
    });

}

/* =================================
   API DE REPORTES
================================= */

app.get('/api/reportes', (req, res) => {

    let reportes = [];

    if (fs.existsSync(DATA_FILE)) {
        reportes = JSON.parse(fs.readFileSync(DATA_FILE));
    }

    const { tipo, usuario, vip } = req.query;

    let filtrados = reportes;

    if (tipo === 'ultimo_año') {

        const hoy = new Date();
        const unAñoAtras = new Date();
        unAñoAtras.setFullYear(hoy.getFullYear() - 1);

        filtrados = filtrados.filter(r => new Date(r.fecha) >= unAñoAtras);
    }

    if (vip !== 'true') {

        filtrados = filtrados.map(r => {

            if (r.usuario !== usuario) {

                return {
                    mensaje: r.mensaje,
                    fecha: r.fecha,
                    categoria: r.categoria,
                    ciudad: r.ciudad,
                    barrio: r.barrio,
                    pais: r.pais
                }

            }

            return r;

        });

    }

    res.json(filtrados);

});

/* =================================
   GUARDAR REPORTE (EJEMPLO)
   ESTE ENDPOINT EMITE AL RADAR
================================= */

app.post('/api/reportar', (req, res) => {

    let reportes = [];

    if (fs.existsSync(DATA_FILE)) {
        reportes = JSON.parse(fs.readFileSync(DATA_FILE));
    }

    const nuevo = req.body;

    reportes.push(nuevo);

    fs.writeFileSync(DATA_FILE, JSON.stringify(reportes, null, 2));

    /* ENVÍA EL REPORTE AL RADAR */
    emitirRadar(nuevo);

    res.json({ ok:true });

});

/* =================================
   SERVER
================================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
