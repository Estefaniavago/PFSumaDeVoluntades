const express = require('express');
const router = express.Router();
const pool = require('../db');
const { autenticar, permitirRoles } = require('../middleware/auth');

// GET /stock - Consulta de stock total por producto y detalle por lote con vencimientos
router.get('/', autenticar, permitirRoles('coordinador_actividad', 'encargado_deposito', 'direccion'), async (req, res) => {
  try {
    const query = `
      SELECT 
        p.id_producto, 
        p.nombre, 
        p.categoria,
        p.unidad_medida, 
        p.minimo_deseable,
        p.perecedero,
        COALESCE(SUM(m.cantidad), 0) AS stock_total,
        COALESCE(
          json_agg(
            json_build_object(
              'id_donacion', d.id_donacion,
              'id_remito', d.id_remito,
              'fecha_vencimiento', d.fecha_vencimiento,
              'estado_lote', d.estado,
              'cantidad_inicial', d.cantidad_inicial,
              'cantidad_actual', (
                SELECT COALESCE(SUM(mi.cantidad), 0) 
                FROM movimientos mi 
                WHERE mi.id_donacion = d.id_donacion
              )
            )
          ) FILTER (WHERE d.id_donacion IS NOT NULL), 
          '[]'
        ) AS lotes
      FROM productos p
      LEFT JOIN donaciones d ON d.id_producto = p.id_producto
      LEFT JOIN movimientos m ON m.id_donacion = d.id_donacion
      WHERE p.activo = TRUE
      GROUP BY p.id_producto
      ORDER BY p.nombre ASC;
    `;

    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (err) {
    console.error('Error al consultar el stock:', err);
    res.status(500).json({ error: 'No se pudo consultar el stock y detalle de lotes.' });
  }
});

module.exports = router;