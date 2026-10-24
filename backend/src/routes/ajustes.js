const express = require('express');
const router = express.Router();
const pool = require('../db');
const { autenticar, permitirRoles } = require('../middleware/auth');

class ErrorNegocio extends Error {}

// POST /ajustes 
router.post('/',
  autenticar,
  permitirRoles('encargado_deposito', 'direccion'),
  async (req, res) => {
    const { id_donacion, cantidad, motivo } = req.body;

    // La cantidad en ajustes puede ser positiva (sobrante) o negativa (faltante)
    if (!id_donacion || cantidad === undefined || cantidad === 0 || !motivo || motivo.trim() === '') {
      return res.status(400).json({ 
        error: 'Faltan datos obligatorios: id_donacion, cantidad (diferente de 0) y un motivo válido.' 
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Si el ajuste es negativo, validamos que no deje el lote por debajo de 0
      if (cantidad < 0) {
        const { rows: stockRows } = await client.query(
          `SELECT COALESCE(SUM(cantidad), 0) AS disponible 
           FROM movimientos 
           WHERE id_donacion = $1`,
          [id_donacion]
        );
        const disponible = parseFloat(stockRows[0].disponible);

        if (Math.abs(cantidad) > disponible) {
          throw new ErrorNegocio(`El ajuste negativo excede el stock disponible en el lote. Disponible: ${disponible}`);
        }
      }

      // Registrar el movimiento de ajuste
      const { rows: movRows } = await client.query(
        `INSERT INTO movimientos (id_donacion, id_usuario, tipo_movimiento, cantidad, motivo)
         VALUES ($1, $2, 'ajuste', $3, $4)
         RETURNING id_movimiento, fecha_hora`,
        [
          id_donacion,
          req.usuario.id,
          cantidad,
          motivo.trim()
        ]
      );

      await client.query('COMMIT');
      res.status(201).json({
        mensaje: 'Ajuste de stock registrado correctamente.',
        movimiento: {
          id_movimiento: movRows[0].id_movimiento,
          id_donacion,
          cantidad_ajustada: cantidad,
          motivo: motivo.trim(),
          fecha_hora: movRows[0].fecha_hora
        }
      });
    } catch (err) {
      await client.query('ROLLBACK');
      if (err instanceof ErrorNegocio) {
        return res.status(400).json({ error: err.message });
      }
      console.error('Error al registrar ajuste:', err);
      res.status(500).json({ error: 'No se pudo registrar el ajuste de stock.' });
    } finally {
      client.release();
    }
  }
);

module.exports = router;