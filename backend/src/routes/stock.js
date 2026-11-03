const express = require('express');
const router = express.Router();
const pool = require('../db');
const { autenticar, permitirRoles } = require('../middleware/auth');

// GET /stock - Stock total por producto y detalle por lote con vencimientos (RF-04).
// El stock se calcula sumando los movimientos (RNF-08). Primero se calcula el saldo de cada lote
// y después se agrupa por producto, así cada lote aparece una sola vez.
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
        COALESCE(SUM(l.saldo), 0) AS stock_total,
        COALESCE(
          json_agg(
            json_build_object(
              'id_donacion', l.id_donacion,
              'id_remito', l.id_remito,
              'fecha_vencimiento', l.fecha_vencimiento,
              'estado_lote', l.estado,
              'cantidad_inicial', l.cantidad_inicial,
              'cantidad_actual', l.saldo
            ) ORDER BY l.fecha_vencimiento ASC NULLS LAST, l.id_donacion
          ) FILTER (WHERE l.id_donacion IS NOT NULL),
          '[]'
        ) AS lotes
      FROM productos p
      LEFT JOIN (
        SELECT d.id_donacion, d.id_producto, d.id_remito, d.fecha_vencimiento, d.estado,
               d.cantidad_inicial, COALESCE(SUM(m.cantidad), 0) AS saldo
        FROM donaciones d
        LEFT JOIN movimientos m ON m.id_donacion = d.id_donacion
        GROUP BY d.id_donacion
      ) l ON l.id_producto = p.id_producto
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
