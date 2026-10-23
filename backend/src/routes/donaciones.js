const express = require('express');
const pool = require('../db');
const { autenticar, permitirRoles } = require('../middleware/auth');
const { validarIngreso } = require('../validaciones');

const router = express.Router();

class ErrorNegocio extends Error {}

router.post('/donaciones',
  autenticar,
  permitirRoles('referente_puerta', 'encargado_deposito'),
  async (req, res) => {
    const errores = validarIngreso(req.body);
    if (errores.length) {
      return res.status(400).json({ error: errores.join(' '), errores });
    }

    const { items, donante_nombre, anonima } = req.body;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Los productos existen y están activos
      const idsProducto = [...new Set(items.map(i => i.id_producto))];
      const { rows: productos } = await client.query(
        'SELECT id_producto, nombre, perecedero FROM productos WHERE activo = TRUE AND id_producto = ANY($1)',
        [idsProducto]
      );
      const mapa = new Map(productos.map(p => [p.id_producto, p]));
      if (idsProducto.some(id => !mapa.has(id))) {
        throw new ErrorNegocio('Alguno de los productos elegidos no existe o está desactivado.');
      }

      // 2. Los perecederos exigen fecha de vencimiento
      for (const it of items) {
        const p = mapa.get(it.id_producto);
        if (p.perecedero && !it.fecha_vencimiento) {
          throw new ErrorNegocio(`${p.nombre} es perecedero: indicá su fecha de vencimiento.`);
        }
      }

      // 3. Si se asigna a una actividad, tiene que existir y estar planificada
      const idsActividad = [...new Set(items.map(i => i.id_actividad).filter(Boolean))];
      if (idsActividad.length) {
        const { rows } = await client.query(
          "SELECT id_actividad FROM actividades WHERE estado = 'planificada' AND id_actividad = ANY($1)",
          [idsActividad]
        );
        if (rows.length !== idsActividad.length) {
          throw new ErrorNegocio('La actividad elegida no existe o ya no está planificada.');
        }
      }

      // 4. Remito con número único
      const { rows: [{ id }] } = await client.query(
        "SELECT nextval(pg_get_serial_sequence('remitos','id_remito')) AS id"
      );
      const nroRemito = `R-${String(id).padStart(6, '0')}`;
      const esAnonima = Boolean(anonima);
      const nombreDonante = esAnonima ? null : ((donante_nombre || '').trim() || null);

      await client.query(
        `INSERT INTO remitos (id_remito, nro_remito, id_usuario, donante_nombre, anonima)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, nroRemito, req.usuario.id, nombreDonante, esAnonima]
      );

      // 5. Un lote y un movimiento de ingreso por cada ítem
      for (const it of items) {
        const estado = it.id_actividad ? 'reservada' : 'disponible';
        const { rows: [lote] } = await client.query(
          `INSERT INTO donaciones
             (id_producto, id_remito, id_actividad_reserva, cantidad_inicial, fecha_vencimiento, estado)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_donacion`,
          [it.id_producto, id, it.id_actividad || null, it.cantidad,
           it.fecha_vencimiento || null, estado]
        );
        await client.query(
          `INSERT INTO movimientos
             (id_donacion, id_usuario, id_actividad, tipo_movimiento, cantidad)
           VALUES ($1, $2, $3, 'ingreso', $4)`,
          [lote.id_donacion, req.usuario.id, it.id_actividad || null, it.cantidad]
        );
      }

      await client.query('COMMIT');
      res.status(201).json({
        mensaje: 'Donación registrada.',
        remito: { id, nro_remito: nroRemito },
        lotes: items.length,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      if (err instanceof ErrorNegocio) {
        return res.status(400).json({ error: err.message });
      }
      console.error(err);
      res.status(500).json({ error: 'No se pudo registrar la donación. No se guardó ningún dato.' });
    } finally {
      client.release();
    }
  }
);

module.exports = router;