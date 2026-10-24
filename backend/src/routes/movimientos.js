const express = require('express');
const router = express.Router();
const pool = require('../db');
const { autenticar, permitirRoles } = require('../middleware/auth');

// GET /movimientos
router.get('/',
  autenticar,
  permitirRoles('encargado_deposito', 'coordinador_actividad', 'direccion'),
  async (req, res) => {
    const { id_producto, tipo_movimiento, id_usuario, id_actividad, fecha_desde, fecha_hasta } = req.query;

    try {
      let query = `
        SELECT 
          m.id_movimiento,
          m.tipo_movimiento,
          m.cantidad,
          m.motivo,
          m.fecha_hora,
          u.nombre AS usuario,
          p.nombre AS producto,
          d.id_donacion,
          d.fecha_vencimiento,
          act.id_actividad,
          dest.nombre AS destino_nombre
        FROM movimientos m
        JOIN usuarios u ON m.id_usuario = u.id_usuario
        JOIN donaciones d ON m.id_donacion = d.id_donacion
        JOIN productos p ON d.id_producto = p.id_producto
        LEFT JOIN actividades act ON m.id_actividad = act.id_actividad
        LEFT JOIN destinos dest ON m.id_destino = dest.id_destino
        WHERE 1 = 1
      `;
      const params = [];
      let paramIndex = 1;

      if (id_producto) {
        query += ` AND p.id_producto = $${paramIndex++}`;
        params.push(id_producto);
      }
      if (tipo_movimiento) {
        query += ` AND m.tipo_movimiento = $${paramIndex++}`;
        params.push(tipo_movimiento);
      }
      if (id_usuario) {
        query += ` AND u.id_usuario = $${paramIndex++}`;
        params.push(id_usuario);
      }
      if (id_actividad) {
        query += ` AND m.id_actividad = $${paramIndex++}`;
        params.push(id_actividad);
      }
      if (fecha_desde) {
        query += ` AND m.fecha_hora >= $${paramIndex++}`;
        params.push(fecha_desde);
      }
      if (fecha_hasta) {
        query += ` AND m.fecha_hora <= $${paramIndex++}`;
        params.push(fecha_hasta);
      }

      query += ` ORDER BY m.fecha_hora DESC LIMIT 100`;

      const { rows } = await pool.query(query, params);
      res.json(rows);
    } catch (err) {
      console.error('Error al consultar historial de movimientos:', err);
      res.status(500).json({ error: 'No se pudo obtener el historial de movimientos.' });
    }
  }
);

module.exports = router;