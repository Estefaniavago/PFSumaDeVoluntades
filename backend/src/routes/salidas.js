const express = require('express');
const router = express.Router();
const pool = require('../db');
const { autenticar, permitirRoles } = require('../middleware/auth');

class ErrorNegocio extends Error {}

// POST /salidas - Registrar egreso/salida de mercadería para una actividad o consumo
router.post('/',
  autenticar,
  permitirRoles('encargado_deposito', 'coordinador_actividad', 'direccion'),
  async (req, res) => {
    const { id_donacion, id_actividad, cantidad, motivo } = req.body;

    if (!id_donacion || !cantidad || cantidad <= 0) {
      return res.status(400).json({ error: 'Debe indicar el lote (id_donacion) y una cantidad válida a retirar.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Verificar el stock actual disponible en el lote (donación) sumando sus movimientos
      const { rows: stockRows } = await client.query(
        `SELECT COALESCE(SUM(cantidad), 0) AS disponible 
         FROM movimientos 
         WHERE id_donacion = $1`,
        [id_donacion]
      );
      const disponible = parseFloat(stockRows[0].disponible);

      if (cantidad > disponible) {
        throw new ErrorNegocio(`Stock insuficiente en el lote seleccionado. Disponible: ${disponible}, solicitado: ${cantidad}`);
      }

      // 2. Si se indica una actividad, verificar que exista y esté planificada
      if (id_actividad) {
        const { rows: actRows } = await client.query(
          "SELECT id_actividad FROM actividades WHERE id_actividad = $1 AND estado = 'planificada'",
          [id_actividad]
        );
        if (actRows.length === 0) {
          throw new ErrorNegocio('La actividad especificada no existe o no se encuentra planificada.');
        }
      }

      // 3. Registrar el movimiento de salida (la cantidad se registra como negativa)
      const { rows: movRows } = await client.query(
        `INSERT INTO movimientos (id_donacion, id_usuario, id_actividad, tipo_movimiento, cantidad, motivo)
         VALUES ($1, $2, $3, 'salida', $4, $5)
         RETURNING id_movimiento, fecha_hora`,
        [
          id_donacion,
          req.usuario.id,
          id_actividad || null,
          -Math.abs(cantidad),
          motivo ? motivo.trim() : 'Salida de mercadería para actividad'
        ]
      );

      await client.query('COMMIT');
      res.status(201).json({
        mensaje: 'Salida de mercadería registrada correctamente.',
        movimiento: {
          id_movimiento: movRows[0].id_movimiento,
          id_donacion,
          cantidad_retirada: cantidad,
          fecha_hora: movRows[0].fecha_hora
        }
      });
    } catch (err) {
      await client.query('ROLLBACK');
      if (err instanceof ErrorNegocio) {
        return res.status(400).json({ error: err.message });
      }
      console.error('Error al registrar salida:', err);
      res.status(500).json({ error: 'No se pudo registrar la salida de mercadería.' });
    } finally {
      client.release();
    }
  }
);

module.exports = router;