const express = require('express');
const cors = require('cors');

// Importación de todas las rutas modulares
const authRoutes = require('./routes/auth');
const donacionesRoutes = require('./routes/donaciones');
const productosRouter = require('./routes/productos');
const stockRouter = require('./routes/stock');
const salidasRouter = require('./routes/salidas');
const derivacionesRouter = require('./routes/derivaciones');
const bajasRouter = require('./routes/bajas');

const app = express();
app.use(cors());
app.use(express.json());

// Montaje de rutas agrupadas por módulo
app.use(authRoutes);
app.use(donacionesRoutes);
app.use('/productos', productosRouter);
app.use('/stock', stockRouter);
app.use('/salidas', salidasRouter);
app.use('/derivaciones', derivacionesRouter);
app.use('/bajas', bajasRouter);

module.exports = app;