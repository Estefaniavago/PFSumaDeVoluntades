const express = require('express');
const router = express.Router();
const pool = require('../db');
const { autenticar, permitirRoles } = require('../middleware/auth');
const { leerNumero, leerId } = require('../validaciones');
const { ErrorNegocio, bloquearLote, cerrarLoteSiSeAgoto } = require('../lotes');

// POST /bajas
router.post('/',
  autenticar,
  permitirRoles('encargado_deposito', 'direccion'),
  async (req, res) => {
    const { id_donacion, motivo } = req.body;

    const lote = leerId(id_donacion, 'Lote (id_donacion)');
    const cantidad = leerNumero(req.body.cantidad, 'Cantidad');
    const error = lote.error || cantidad.error ||
      (!motivo || !String(motivo).trim() ? 'Indicá el motivo de la baja.' : null);
    if (error) {
      return res.status(400).json({ error });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Bloquear el lote y verificar que alcance
      const { saldo } = await bloquearLote(client, lote.valor);
      if (cantidad.valor > saldo) {
        throw new ErrorNegocio(`No se puede dar de baja una cantidad mayor al stock disponible en el lote. Disponible: ${saldo}, solicitado: ${cantidad.valor}.`);
      }

      // Registrar el movimiento 
      const { rows: movRows } = await client.query(
        `INSERT INTO movimientos (id_donacion, id_usuario, tipo_movimiento, cantidad, motivo)
         VALUES ($1, $2, 'baja', $3, $4)
         RETURNING id_movimiento, fecha_hora`,
        [
          lote.valor,
          req.usuario.id,
          -cantidad.valor,
          String(motivo).trim()
        ]
      );

      // Si el lote quedó vacío, pasa a "vencida_descartada"
      await cerrarLoteSiSeAgoto(client, lote.valor, 'vencida_descartada');

      await client.query('COMMIT');
      res.status(201).json({
        mensaje: 'Baja de mercadería registrada correctamente.',
        movimiento: {
          id_movimiento: movRows[0].id_movimiento,
          id_donacion: lote.valor,
          cantidad_dada_de_baja: cantidad.valor,
          motivo: String(motivo).trim(),
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