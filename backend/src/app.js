const express = require('express');
const cors = require('cors');

// Importar rutas
const productoRoutes = require('./routes/producto.routes');
const usuarioRoutes = require('./routes/usuario.routes');
const remitoRoutes = require('./routes/remito.routes');
const menuRoutes = require('./routes/menu.routes');

const app = express();
app.use(cors());
app.use(express.json());

// Montar las rutas
app.use('/productos', productoRoutes);
app.use('/usuarios', usuarioRoutes);
app.use('/remitos', remitoRoutes);
app.use('/menus', menuRoutes);

module.exports = app;