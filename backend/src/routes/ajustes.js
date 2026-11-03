const express = require('express');
const router = express.Router();
const pool = require('../db');
const { autenticar, permitirRoles } = require('../middleware/auth');
const { leerNumero, leerId } = require('../validaciones');
const { ErrorNegocio, bloquearLote } = require('../lotes');

// POST /ajustes 
router.post('/',
  autenticar,
  permitirRoles('encargado_deposito', 'direccion'),
  async (req, res) => {
    const { id_donacion, motivo } = req.body;

    // La cantidad en ajustes puede ser positiva (sobrante) o negativa (faltante), pero no cero
    const lote = leerId(id_donacion, 'Lote (id_donacion)');
    const cantidad = leerNumero(req.body.cantidad, 'Cantidad', { permitirNegativo: true });
    const error = lote.error || cantidad.error ||
      (!motivo || !String(motivo).trim() ? 'Indicá el motivo del ajuste.' : null);
    if (error) {
      return res.status(400).json({ error });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Bloquear el lote; si el ajuste es negativo, no puede dejarlo por debajo de 0
      const { saldo } = await bloquearLote(client, lote.valor);
      if (cantidad.valor < 0 && -cantidad.valor > saldo) {
        throw new ErrorNegocio(`El ajuste negativo excede el stock disponible en el lote. Disponible: ${saldo}.`);
      }

      // Registrar el movimiento de ajuste
      const { rows: movRows } = await client.query(
        `INSERT INTO movimientos (id_donacion, id_usuario, tipo_movimiento, cantidad, motivo)
         VALUES ($1, $2, 'ajuste', $3, $4)
         RETURNING id_movimiento, fecha_hora`,
        [
          lote.valor,
          req.usuario.id,
          cantidad.valor,
          String(motivo).trim()
        ]
      );

      await client.query('COMMIT');
      res.status(201).json({
        mensaje: 'Ajuste de stock registrado correctamente.',
        movimiento: {
          id_movimiento: movRows[0].id_movimiento,
          id_donacion: lote.valor,
          cantidad_ajustada: cantidad.valor,
          motivo: String(motivo).trim(),
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