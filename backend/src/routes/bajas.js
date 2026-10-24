const express = require('express');
const router = express.Router();
const pool = require('../db');
const { autenticar, permitirRoles } = require('../middleware/auth');

class ErrorNegocio extends Error {}

// POST /bajas
router.post('/',
  autenticar,
  permitirRoles('encargado_deposito', 'direccion'),
  async (req, res) => {
    const { id_donacion, cantidad, motivo } = req.body;

    if (!id_donacion || !cantidad || cantidad <= 0 || !motivo || motivo.trim() === '') {
      return res.status(400).json({ 
        error: 'Faltan datos obligatorios: id_donacion, cantidad (mayor a 0) y un motivo válido para la baja.' 
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verificar stock
      const { rows: stockRows } = await client.query(
        `SELECT COALESCE(SUM(cantidad), 0) AS disponible 
         FROM movimientos 
         WHERE id_donacion = $1`,
        [id_donacion]
      );
      const disponible = parseFloat(stockRows[0].disponible);

      if (cantidad > disponible) {
        throw new ErrorNegocio(`No se puede dar de baja una cantidad mayor al stock disponible en el lote. Disponible: ${disponible}, solicitado: ${cantidad}`);
      }

      // Registrar el movimiento 
      const { rows: movRows } = await client.query(
        `INSERT INTO movimientos (id_donacion, id_usuario, tipo_movimiento, cantidad, motivo)
         VALUES ($1, $2, 'baja', $3, $4)
         RETURNING id_movimiento, fecha_hora`,
        [
          id_donacion,
          req.usuario.id,
          -Math.abs(cantidad),
          motivo.trim()
        ]
      );

      await client.query('COMMIT');
      res.status(201).json({
        mensaje: 'Baja de mercadería registrada correctamente.',
        movimiento: {
          id_movimiento: movRows[0].id_movimiento,
          id_donacion,
          cantidad_dada_de_baja: cantidad,
          motivo: motivo.trim(),
          fecha_hora: movRows[0].fecha_hora
        }
      });
    } catch (err) {
      await client.query('ROLLBACK');
      if (err instanceof ErrorNegocio) {
        return res.status(400).json({ error: err.message });
      }
      console.error('Error al registrar baja de mercadería:', err);
      res.status(500).json({ error: 'No se pudo registrar la baja de mercadería.' });
    } finally {
      client.release();
    }
  }
);

module.exports = router;