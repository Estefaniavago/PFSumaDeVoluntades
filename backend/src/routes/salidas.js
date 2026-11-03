const express = require('express');
const router = express.Router();
const pool = require('../db');
const { autenticar, permitirRoles } = require('../middleware/auth');
const { leerNumero, leerId } = require('../validaciones');
const { ErrorNegocio, bloquearLote, cerrarLoteSiSeAgoto } = require('../lotes');

// POST /salidas - Registrar la salida de mercadería de un lote, para una actividad o consumo (RF-05).
// Según la tabla de permisos, las salidas las registran el encargado de depósito y la dirección.
router.post('/',
  autenticar,
  permitirRoles('encargado_deposito'),
  async (req, res) => {
    const { id_donacion, id_actividad, motivo } = req.body;

    const lote = leerId(id_donacion, 'Lote (id_donacion)');
    const cantidad = leerNumero(req.body.cantidad, 'Cantidad');
    const actividad = id_actividad ? leerId(id_actividad, 'Actividad (id_actividad)') : { valor: null };
    const error = lote.error || cantidad.error || actividad.error;
    if (error) {
      return res.status(400).json({ error });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Bloquear el lote y verificar que alcance
      const { saldo } = await bloquearLote(client, lote.valor);
      if (cantidad.valor > saldo) {
        throw new ErrorNegocio(`Stock insuficiente en el lote seleccionado. Disponible: ${saldo}, solicitado: ${cantidad.valor}.`);
      }

      // 2. Si se indica una actividad, tiene que existir y estar planificada
      if (actividad.valor) {
        const { rows: actRows } = await client.query(
          "SELECT id_actividad FROM actividades WHERE id_actividad = $1 AND estado = 'planificada'",
          [actividad.valor]
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
          lote.valor,
          req.usuario.id,
          actividad.valor,
          -cantidad.valor,
          motivo ? motivo.trim() : 'Salida de mercadería para actividad'
        ]
      );

      // 4. Si el lote quedó vacío, pasa a "entregada"
      await cerrarLoteSiSeAgoto(client, lote.valor, 'entregada');

      await client.query('COMMIT');
      res.status(201).json({
        mensaje: 'Salida de mercadería registrada correctamente.',
        movimiento: {
          id_movimiento: movRows[0].id_movimiento,
          id_donacion: lote.valor,
          cantidad_retirada: cantidad.valor,
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
