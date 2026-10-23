const express = require('express');
const cors = require('cors');
const pool = require('./db');
const authRoutes = require('./routes/auth');
const { autenticar, permitirRoles } = require('./middleware/auth');

const app = express();
app.use(cors());
app.use(express.json());

app.use(authRoutes);

const donacionesRoutes = require('./routes/donaciones');
app.use(donacionesRoutes);

// Catálogo: cualquier usuario con sesión (el referente de puerta lo necesita para cargar ingresos)
app.get('/productos', autenticar, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM productos WHERE activo = TRUE ORDER BY nombre'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo consultar la base de datos.' });
  }
});

// Stock: se CALCULA sumando movimientos (RNF-08). No lo ve el referente de puerta.
app.get('/stock', autenticar,
  permitirRoles('coordinador_actividad', 'encargado_deposito'),
  async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT p.id_producto, p.nombre, p.unidad_medida, p.minimo_deseable,
          COALESCE(SUM(CASE m.tipo_movimiento
            WHEN 'ingreso' THEN m.cantidad
            WHEN 'ajuste'  THEN m.cantidad
            ELSE -m.cantidad END), 0) AS stock
        FROM productos p
        LEFT JOIN donaciones d ON d.id_producto = p.id_producto
        LEFT JOIN movimientos m ON m.id_donacion = d.id_donacion
        WHERE p.activo = TRUE
        GROUP BY p.id_producto
        ORDER BY p.nombre`);
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'No se pudo consultar el stock.' });
    }
  }
);

module.exports = app;