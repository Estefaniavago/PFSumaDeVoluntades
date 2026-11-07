const express = require('express');
const router = express.Router();
const pool = require('../db');
const { autenticar, permitirRoles } = require('../middleware/auth');
const { leerId } = require('../validaciones');

const TIPOS = ['ingreso', 'salida', 'derivacion', 'baja', 'ajuste'];
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// GET /movimientos - Historial de movimientos (RF-08), del más nuevo al más viejo, con filtros opcionales.
// Las fechas se reciben como AAAA-MM-DD y se toman en hora de Argentina; "hasta" incluye todo ese día.
router.get('/',
  autenticar,
  permitirRoles('encargado_deposito', 'coordinador_actividad', 'direccion'),
  async (req, res) => {
    const { tipo_movimiento, fecha_desde, fecha_hasta } = req.query;

    // Validar los filtros antes de armar la consulta
    const ids = {};
    const nombres = { id_producto: 'Producto', id_usuario: 'Usuario', id_actividad: 'Actividad', id_donacion: 'Lote' };
    for (const campo of Object.keys(nombres)) {
      if (req.query[campo]) {
        const leido = leerId(req.query[campo], nombres[campo]);
        if (leido.error) return res.status(400).json({ error: leido.error });
        ids[campo] = leido.valor;
      }
    }
    if (tipo_movimiento && !TIPOS.includes(tipo_movimiento)) {
      return res.status(400).json({ error: `Tipo de movimiento inválido. Debe ser uno de: ${TIPOS.join(', ')}.` });
    }
    if ((fecha_desde && !FECHA.test(fecha_desde)) || (fecha_hasta && !FECHA.test(fecha_hasta))) {
      return res.status(400).json({ error: 'Las fechas tienen que tener el formato AAAA-MM-DD.' });
    }
    const { id_producto, id_usuario, id_actividad, id_donacion } = ids;

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
          p.unidad_medida,
          d.id_donacion,
          d.fecha_vencimiento,
          r.nro_remito,
          act.id_actividad,
          act.tipo_actividad,
          act.fecha_hora_salida,
          dest.nombre AS destino_nombre
        FROM movimientos m
        JOIN usuarios u ON m.id_usuario = u.id_usuario
        JOIN donaciones d ON m.id_donacion = d.id_donacion
        JOIN productos p ON d.id_producto = p.id_producto
        JOIN remitos r ON d.id_remito = r.id_remito
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
      if (id_donacion) {
        query += ` AND d.id_donacion = $${paramIndex++}`;
        params.push(id_donacion);
      }
      if (fecha_desde) {
        query += ` AND m.fecha_hora >= ($${paramIndex++}::date AT TIME ZONE 'America/Argentina/Buenos_Aires')`;
        params.push(fecha_desde);
      }
      if (fecha_hasta) {
        query += ` AND m.fecha_hora < (($${paramIndex++}::date + 1) AT TIME ZONE 'America/Argentina/Buenos_Aires')`;
        params.push(fecha_hasta);
      }

      query += ` ORDER BY m.fecha_hora DESC, m.id_movimiento DESC LIMIT 100`;

      const { rows } = await pool.query(query, params);
      res.json(rows);
    } catch (err) {
      console.error('Error al consultar historial de movimientos:', err);
      res.status(500).json({ error: 'No se pudo obtener el historial de movimientos.' });
    }
  }
);

// GET /movimientos/usuarios - Personas que registraron algún movimiento, para filtrar el historial
// por usuario (RF-13). Solo nombre e id: el listado completo de usuarios es de la dirección.
router.get('/usuarios',
  autenticar,
  permitirRoles('encargado_deposito', 'coordinador_actividad', 'direccion'),
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT DISTINCT u.id_usuario, u.nombre
         FROM movimientos m JOIN usuarios u ON u.id_usuario = m.id_usuario
         ORDER BY u.nombre`
      );
      res.json(rows);
    } catch (err) {
      console.error('Error al listar usuarios del historial:', err);
      res.status(500).json({ error: 'No se pudo obtener la lista de usuarios.' });
    }
  }
);

module.exports = router;