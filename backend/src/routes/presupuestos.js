const express = require('express');
const router = express.Router();
const pool = require('../db');
const { autenticar, permitirRoles } = require('../middleware/auth');

class ErrorNegocio extends Error {}

// GET /actividades/:id/presupuesto calcular insumos necesarios contra el stock disponible
router.get('/actividades/:id/presupuesto', autenticar, async (req, res) => {
  const { id } = req.params;

  try {
    // obtener actividad y su menú
    const { rows: actRows } = await pool.query(
      'SELECT id_actividad, porciones_estimadas, id_menu FROM actividades WHERE id_actividad = $1',
      [id]
    );
    if (actRows.length === 0) {
      return res.status(404).json({ error: 'Actividad no encontrada.' });
    }
    const actividad = actRows[0];
    if (!actividad.id_menu) {
      return res.status(400).json({ error: 'La actividad no tiene un menú asignado.' });
    }

    // obtener insumos del menú
    const { rows: insumosMenu } = await pool.query(
      'SELECT id_producto, cantidad_por_porcion FROM menu_insumos WHERE id_menu = $1',
      [actividad.id_menu]
    );

    const resultado = [];

    for (const insumo of insumosMenu) {
      const cantidadNecesaria = insumo.cantidad_por_porcion * actividad.porciones_estimadas;

      //obtener stock disponible y no vencido
      const { rows: lotesDisponibles } = await pool.query(
        `SELECT 
           d.id_donacion,
           d.fecha_vencimiento,
           COALESCE(SUM(m.cantidad), 0) AS stock_disponible
         FROM donaciones d
         JOIN movimientos m ON m.id_donacion = d.id_donacion
         WHERE d.id_producto = $1 
           AND d.estado IN ('recibida', 'disponible')
           AND (d.fecha_vencimiento IS NULL OR d.fecha_vencimiento >= CURRENT_DATE)
         GROUP BY d.id_donacion, d.fecha_vencimiento
         HAVING COALESCE(SUM(m.cantidad), 0) > 0
         ORDER BY d.fecha_vencimiento ASC NULLS LAST`,
        [insumo.id_producto]
      );

      const stockTotalDisponible = lotesDisponibles.reduce((acc, l) => acc + parseFloat(l.stock_disponible), 0);
      const faltante = Math.max(0, cantidadNecesaria - stockTotalDisponible);

      resultado.push({
        id_producto: insumo.id_producto,
        cantidad_necesaria: cantidadNecesaria,
        stock_disponible: stockTotalDisponible,
        faltante: faltante,
        lotes_disponibles: lotesDisponibles
      });
    }

    res.json({ id_actividad: actividad.id_actividad, porciones: actividad.porciones_estimadas, insumos: resultado });
  } catch (err) {
    console.error('Error al calcular presupuesto:', err);
    res.status(500).json({ error: 'No se pudo calcular el presupuesto de insumos.' });
  }
});

// POST /actividades/:id/reservar
router.post('/actividades/:id/reservar', autenticar, permitirRoles('coordinador_actividad', 'direccion'), async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    //obtener actividad y menú
    const { rows: actRows } = await client.query('SELECT porciones_estimadas, id_menu FROM actividades WHERE id_actividad = $1', [id]);
    if (actRows.length === 0) throw new ErrorNegocio('Actividad no encontrada.');
    const actividad = actRows[0];
    if (!actividad.id_menu) throw new ErrorNegocio('La actividad no tiene menú asignado.');

    const { rows: insumosMenu } = await client.query('SELECT id_producto, cantidad_por_porcion FROM menu_insumos WHERE id_menu = $1', [actividad.id_menu]);

    const faltantesGenerados = [];

    for (const insumo of insumosMenu) {
      let porCubrir = insumo.cantidad_por_porcion * actividad.porciones_estimadas;

      //buscar lotes disponibles ordenado por fecha de vencimiento
      const { rows: lotes } = await client.query(
        `SELECT d.id_donacion, COALESCE(SUM(m.cantidad), 0) AS disponible
         FROM donaciones d
         JOIN movimientos m ON m.id_donacion = d.id_donacion
         WHERE d.id_producto = $1 AND d.estado IN ('recibida', 'disponible') AND (d.fecha_vencimiento IS NULL OR d.fecha_vencimiento >= CURRENT_DATE)
         GROUP BY d.id_donacion HAVING COALESCE(SUM(m.cantidad), 0) > 0 ORDER BY d.fecha_vencimiento ASC NULLS LAST`,
        [insumo.id_producto]
      );

      for (const lote of lotes) {
        if (porCubrir <= 0) break;
        const disp = parseFloat(lote.disponible);
        const aReservar = Math.min(disp, porCubrir);

        //registrar reserva
        await client.query(
          `INSERT INTO movimientos (id_donacion, id_usuario, id_actividad, tipo_movimiento, cantidad, motivo)
           VALUES ($1, $2, $3, 'salida', $4, $5)`,
          [lote.id_donacion, req.usuario.id, id, -aReservar, `Reserva para actividad ID ${id}`]
        );

        //actualizar estado del lote a reservada
        await client.query("UPDATE donaciones SET estado = 'reservada' WHERE id_donacion = $1", [lote.id_donacion]);

        porCubrir -= aReservar;
      }

      //si queda faltante, registrar pedido de reposición
      if (porCubrir > 0) {
        await client.query(
          `INSERT INTO pedidos_reposicion (id_actividad, id_producto, id_usuario, cantidad_faltante, estado)
           VALUES ($1, $2, $3, $4, 'pendiente')`,
          [id, insumo.id_producto, req.usuario.id, porCubrir]
        );
        faltantesGenerados.push({ id_producto: insumo.id_producto, faltante: porCubrir });
      }
    }

    await client.query('COMMIT');
    res.status(201).json({
      mensaje: 'Insumos reservados correctamente para la actividad.',
      faltantes_registrados: faltantesGenerados
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof ErrorNegocio) return res.status(400).json({ error: err.message });
    console.error('Error al reservar insumos:', err);
    res.status(500).json({ error: 'No se pudieron reservar los insumos.' });
  } finally {
    client.release();
  }
});

module.exports = router;