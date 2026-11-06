const express = require('express');
const router = express.Router();
const pool = require('../db');
const { autenticar, permitirRoles } = require('../middleware/auth');
const { leerId } = require('../validaciones');
const { ErrorNegocio, bloquearLote, cerrarLoteSiSeAgoto } = require('../lotes');

const redondear = n => Math.round(n * 100) / 100;

// Calcula, para cada insumo del menú, cuánto hace falta según las porciones y cuánto hay en lotes
// disponibles y no vencidos, ordenados por vencimiento (primero el que vence antes).
// "db" puede ser el pool o un cliente dentro de una transacción.
async function calcularPresupuesto(db, idActividad) {
  const { rows: actRows } = await db.query(
    'SELECT id_actividad, porciones_estimadas, id_menu, estado FROM actividades WHERE id_actividad = $1',
    [idActividad]
  );
  if (actRows.length === 0) throw new ErrorNegocio('Actividad no encontrada.', 404);
  const actividad = actRows[0];
  if (!actividad.id_menu) throw new ErrorNegocio('La actividad no tiene un menú asignado.');

  const { rows: insumosMenu } = await db.query(
    `SELECT mi.id_producto, mi.cantidad_por_porcion, p.nombre, p.unidad_medida
     FROM menu_insumos mi
     JOIN productos p ON p.id_producto = mi.id_producto
     WHERE mi.id_menu = $1
     ORDER BY p.nombre`,
    [actividad.id_menu]
  );

  const insumos = [];
  for (const insumo of insumosMenu) {
    const cantidadNecesaria = redondear(insumo.cantidad_por_porcion * actividad.porciones_estimadas);

    const { rows: lotesDisponibles } = await db.query(
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
       ORDER BY d.fecha_vencimiento ASC NULLS LAST, d.id_donacion`,
      [insumo.id_producto]
    );

    const stockTotalDisponible = redondear(lotesDisponibles.reduce((acc, l) => acc + parseFloat(l.stock_disponible), 0));

    insumos.push({
      id_producto: insumo.id_producto,
      nombre: insumo.nombre,
      unidad_medida: insumo.unidad_medida,
      cantidad_necesaria: cantidadNecesaria,
      stock_disponible: stockTotalDisponible,
      faltante: redondear(Math.max(0, cantidadNecesaria - stockTotalDisponible)),
      lotes_disponibles: lotesDisponibles
    });
  }

  return { actividad, insumos };
}

// GET /actividades/:id/presupuesto calcular insumos necesarios contra el stock disponible.
// Muestra stock, así que lo ven los mismos perfiles que GET /stock (no el referente de puerta).
router.get('/actividades/:id/presupuesto', autenticar, permitirRoles('coordinador_actividad', 'encargado_deposito'), async (req, res) => {
  const id = leerId(req.params.id, 'Actividad');
  if (id.error) return res.status(400).json({ error: id.error });

  try {
    const { actividad, insumos } = await calcularPresupuesto(pool, id.valor);
    res.json({ id_actividad: actividad.id_actividad, porciones: actividad.porciones_estimadas, insumos });
  } catch (err) {
    if (err instanceof ErrorNegocio) return res.status(err.status).json({ error: err.message });
    console.error('Error al calcular presupuesto:', err);
    res.status(500).json({ error: 'No se pudo calcular el presupuesto de insumos.' });
  }
});

// POST /actividades/:id/salida - Registra de una sola vez la mercadería que sale del depósito para
// la actividad (RF-05): de cada insumo se saca lo que hace falta, o lo que haya si no alcanza,
// empezando por los lotes que vencen antes. Todo en una transacción: o sale todo o no sale nada.
// La actividad pasa a "realizada", así no se puede registrar la salida dos veces.
router.post('/actividades/:id/salida', autenticar, permitirRoles('encargado_deposito'), async (req, res) => {
  const id = leerId(req.params.id, 'Actividad');
  if (id.error) return res.status(400).json({ error: id.error });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Bloquear la actividad para que dos personas no registren la misma salida a la vez
    const { rows: actRows } = await client.query(
      'SELECT estado FROM actividades WHERE id_actividad = $1 FOR UPDATE',
      [id.valor]
    );
    if (actRows.length === 0) throw new ErrorNegocio('Actividad no encontrada.', 404);
    if (actRows[0].estado !== 'planificada') {
      throw new ErrorNegocio(actRows[0].estado === 'realizada'
        ? 'La salida de esta actividad ya se registró.'
        : 'La actividad está cancelada.');
    }

    const { insumos } = await calcularPresupuesto(client, id.valor);
    const retirado = [];

    for (const insumo of insumos) {
      let porSacar = insumo.cantidad_necesaria;
      let sacado = 0;

      for (const lote of insumo.lotes_disponibles) {
        if (porSacar <= 0) break;
        const { saldo } = await bloquearLote(client, lote.id_donacion);
        const cantidad = redondear(Math.min(saldo, porSacar));
        if (cantidad <= 0) continue;

        await client.query(
          `INSERT INTO movimientos (id_donacion, id_usuario, id_actividad, tipo_movimiento, cantidad, motivo)
           VALUES ($1, $2, $3, 'salida', $4, $5)`,
          [lote.id_donacion, req.usuario.id, id.valor, -cantidad, `Salida para la actividad ${id.valor}`]
        );
        await cerrarLoteSiSeAgoto(client, lote.id_donacion, 'entregada');

        porSacar = redondear(porSacar - cantidad);
        sacado = redondear(sacado + cantidad);
      }

      retirado.push({
        id_producto: insumo.id_producto,
        nombre: insumo.nombre,
        unidad_medida: insumo.unidad_medida,
        cantidad_necesaria: insumo.cantidad_necesaria,
        cantidad_retirada: sacado,
        faltante: porSacar
      });
    }

    if (!retirado.some(r => r.cantidad_retirada > 0)) {
      throw new ErrorNegocio('No hay stock disponible de ninguno de los insumos de esta actividad.');
    }

    await client.query("UPDATE actividades SET estado = 'realizada' WHERE id_actividad = $1", [id.valor]);
    await client.query('COMMIT');
    res.status(201).json({ mensaje: 'Salida de mercadería registrada correctamente.', insumos: retirado });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof ErrorNegocio) return res.status(err.status).json({ error: err.message });
    console.error('Error al registrar la salida de la actividad:', err);
    res.status(500).json({ error: 'No se pudo registrar la salida de mercadería.' });
  } finally {
    client.release();
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

// Se exporta también para poder probar el cálculo de forma aislada (tests/presupuesto.test.js).
module.exports.calcularPresupuesto = calcularPresupuesto;
