const express = require('express');
const router = express.Router();
const pool = require('../db');
const { autenticar, permitirRoles } = require('../middleware/auth');

class ErrorNegocio extends Error {}

// POST /aportes
router.post('/',
  autenticar,
  permitirRoles('referente_puerta', 'encargado_deposito', 'direccion'),
  async (req, res) => {
    const { monto, donante_nombre, anonima, motivo } = req.body;

    if (!monto || monto <= 0) {
      return res.status(400).json({ error: 'Debe indicar un monto monetario válido mayor a 0.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      //buscar el id_producto correspondiente a 'Aporte monetario'
      const { rows: prodRows } = await client.query(
        "SELECT id_producto FROM productos WHERE categoria = 'dinero' AND activo = TRUE LIMIT 1"
      );
      if (prodRows.length === 0) {
        throw new ErrorNegocio('No se encontró el producto de categoría dinero configurado en el catálogo.');
      }
      const idProductoDinero = prodRows[0].id_producto;

      // generar número de remito
      const { rows: [{ id: idRemito }] } = await client.query(
        "SELECT nextval(pg_get_serial_sequence('remitos','id_remito')) AS id"
      );
      const nroRemito = `REM-DIN-${String(idRemito).padStart(6, '0')}`;
      const esAnonima = Boolean(anonima);
      const nombreDonante = esAnonima ? null : ((donante_nombre || '').trim() || null);

      await client.query(
        `INSERT INTO remitos (id_remito, nro_remito, id_usuario, donante_nombre, anonima)
         VALUES ($1, $2, $3, $4, $5)`,
        [idRemito, nroRemito, req.usuario.id, nombreDonante, esAnonima]
      );

      // crear la donación de dinero
      const { rows: [lote] } = await client.query(
        `INSERT INTO donaciones (id_producto, id_remito, cantidad_inicial, estado)
         VALUES ($1, $2, $3, 'disponible')
         RETURNING id_donacion`,
        [idProductoDinero, idRemito, monto]
      );

      // registrar el ingreso de dinero
      await client.query(
        `INSERT INTO movimientos (id_donacion, id_usuario, tipo_movimiento, cantidad, motivo)
         VALUES ($1, $2, 'ingreso', $3, $4)`,
        [
          lote.id_donacion,
          req.usuario.id,
          monto,
          motivo ? motivo.trim() : 'Aporte monetario registrado'
        ]
      );

      await client.query('COMMIT');
      res.status(201).json({
        mensaje: 'Aporte monetario registrado correctamente.',
        remito: { id_remito: idRemito, nro_remito: nroRemito },
        aporte: { id_donacion: lote.id_donacion, monto }
      });
    } catch (err) {
      await client.query('ROLLBACK');
      if (err instanceof ErrorNegocio) {
        return res.status(400).json({ error: err.message });
      }
      console.error('Error al registrar aporte monetario:', err);
      res.status(500).json({ error: 'No se pudo registrar el aporte monetario.' });
    } finally {
      client.release();
    }
  }
);

module.exports = router;