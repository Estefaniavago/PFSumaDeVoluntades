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
const ajustesRouter = require('./routes/ajustes');
const movimientosRouter = require('./routes/movimientos');
const alertasRouter = require('./routes/alertas');
const aportesRouter = require('./routes/aportes');
const menusRouter = require('./routes/menus');
const actividadesRouter = require('./routes/actividades');
const presupuestosRouter = require('./routes/presupuestos');
const usuariosRouter = require('./routes/usuarios');

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
app.use('/ajustes', ajustesRouter);
app.use('/movimientos', movimientosRouter);
app.use('/alertas', alertasRouter);
app.use('/aportes', aportesRouter);
app.use('/menus', menusRouter);
app.use('/actividades', actividadesRouter);
app.use(presupuestosRouter);
app.use('/usuarios', usuariosRouter);

module.exports = app; 