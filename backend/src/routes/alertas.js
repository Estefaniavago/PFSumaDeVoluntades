const express = require('express');
const router = express.Router();
const pool = require('../db');
const { autenticar, permitirRoles } = require('../middleware/auth');

// GET /alertas - Obtener productos bajo stock mínimo y lotes proximos a vencer
router.get('/',
  autenticar,
  permitirRoles('encargado_deposito', 'coordinador_actividad', 'direccion'),
  async (req, res) => {
    try {
      // alertas de stock mínimo
      const queryStockMinimo = `
        SELECT 
          p.id_producto,
          p.nombre,
          p.unidad_medida,
          p.minimo_deseable,
          COALESCE(SUM(m.cantidad), 0) AS stock_actual
        FROM productos p
        LEFT JOIN donaciones d ON d.id_producto = p.id_producto
        LEFT JOIN movimientos m ON m.id_donacion = d.id_donacion
        WHERE p.activo = TRUE
        GROUP BY p.id_producto
        HAVING COALESCE(SUM(m.cantidad), 0) < p.minimo_deseable
        ORDER BY p.nombre ASC;
      `;

      // alertas de vencimiento próximo
      const queryProximosAVencer = `
        SELECT 
          d.id_donacion,
          p.nombre AS producto,
          d.fecha_vencimiento,
          d.id_remito,
          COALESCE(SUM(m.cantidad), 0) AS stock_actual_lote
        From donaciones d
        JOIN productos p ON d.id_producto = p.id_producto
        JOIN movimientos m ON m.id_donacion = d.id_donacion
        WHERE d.fecha_vencimiento IS NOT NULL 
          AND d.fecha_vencimiento <= CURRENT_DATE + INTERVAL '7 days'
          AND d.fecha_vencimiento >= CURRENT_DATE
        GROUP BY d.id_donacion, p.nombre, d.fecha_vencimiento, d.id_remito
        HAVING COALESCE(SUM(m.cantidad), 0) > 0
        ORDER BY d.fecha_vencimiento ASC;
      `;

      const [stockMinimoRes, vencimientoRes] = await Promise.all([
        pool.query(queryStockMinimo),
        pool.query(queryProximosAVencer)
      ]);

      res.json({
        stock_bajo_minimo: stockMinimoRes.rows,
        proximos_a_vencer: vencimientoRes.rows
      });
    } catch (err) {
      console.error('Error al generar alertas:', err);
      res.status(500).json({ error: 'No se pudieron consultar las alertas del sistema.' });
    }
  }
);

module.exports = router;