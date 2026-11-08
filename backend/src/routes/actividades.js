const express = require('express');
const router = express.Router();
const pool = require('../db');
const { autenticar, permitirRoles } = require('../middleware/auth');
const { leerNumero, leerId } = require('../validaciones');
const { leerNumero, leerId } = require('../validaciones');
const { ErrorNegocio } = require('../lotes');

// GET /actividades
router.get('/', autenticar, async (req, res) => {
  try {
    const query = `
      SELECT 
        a.id_actividad,
        a.tipo_actividad,
        a.fecha_hora_salida,
        a.porciones_estimadas,
        a.porciones_reales,
        a.estado,
        m.id_menu,
        m.nombre_menu,
        u.nombre AS coordinador
      FROM actividades a
      LEFT JOIN menus m ON a.id_menu = m.id_menu
      JOIN usuarios u ON a.id_coordinador = u.id_usuario
      ORDER BY a.fecha_hora_salida DESC;
    `;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (err) {
    console.error('Error al listar actividades:', err);
    res.status(500).json({ error: 'No se pudo obtener el listado de actividades.' });
  }
});

// POST /actividades crear actividad
router.post('/', autenticar, permitirRoles('direccion', 'coordinador_actividad'), async (req, res) => {
  const { id_menu, tipo_actividad, fecha_hora_salida } = req.body;

  const tiposValidos = ['desayuno', 'merienda', 'cena', 'salida_barrios', 'ropero', 'evento'];
  if (!tipo_actividad || !tiposValidos.includes(tipo_actividad)) {
    return res.status(400).json({ error: `Tipo de actividad inválido. Debe ser uno de: ${tiposValidos.join(', ')}.` });
  }
  if (!fecha_hora_salida || isNaN(new Date(fecha_hora_salida))) {
    return res.status(400).json({ error: 'Indicá una fecha y hora de salida válida.' });
  }
  const porciones = leerNumero(req.body.porciones_estimadas, 'Porciones estimadas', { entero: true });
  const menu = id_menu ? leerId(id_menu, 'Menú (id_menu)') : { valor: null };
  if (porciones.error || menu.error) {
    return res.status(400).json({ error: porciones.error || menu.error });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO actividades (id_menu, id_coordinador, tipo_actividad, fecha_hora_salida, porciones_estimadas, estado)
       VALUES ($1, $2, $3, $4, $5, 'planificada')
       RETURNING *`,
      [menu.valor, req.usuario.id, tipo_actividad, fecha_hora_salida, porciones.valor]
    );
    res.status(201).json({
      mensaje: 'Actividad planificada correctamente.',
      actividad: rows[0]
    });
  } catch (err) {
    console.error('Error al crear actividad:', err);
    res.status(500).json({ error: 'No se pudo registrar la actividad.' });
  }
});

// PUT /actividades/:id - Editar una actividad planificada: tipo, fecha, porciones o menú (RF-16).
// Solo se cambian los campos que llegan. Una actividad que ya salió o se canceló no se edita.
router.put('/:id', autenticar, permitirRoles('direccion', 'coordinador_actividad'), async (req, res) => {
  const id = leerId(req.params.id, 'Actividad');
  if (id.error) return res.status(400).json({ error: id.error });
  const { tipo_actividad, fecha_hora_salida, id_menu } = req.body;

  const tiposValidos = ['desayuno', 'merienda', 'cena', 'salida_barrios', 'ropero', 'evento'];
  if (tipo_actividad !== undefined && !tiposValidos.includes(tipo_actividad)) {
    return res.status(400).json({ error: `Tipo de actividad inválido. Debe ser uno de: ${tiposValidos.join(', ')}.` });
  }
  if (fecha_hora_salida !== undefined && (!fecha_hora_salida || isNaN(new Date(fecha_hora_salida)))) {
    return res.status(400).json({ error: 'Indicá una fecha y hora de salida válida.' });
  }
  const porciones = req.body.porciones_estimadas !== undefined
    ? leerNumero(req.body.porciones_estimadas, 'Porciones estimadas', { entero: true })
    : { valor: null };
  // id_menu: null quita el menú; si no viene, queda el que estaba
  const menu = id_menu ? leerId(id_menu, 'Menú (id_menu)') : { valor: null };
  if (porciones.error || menu.error) {
    return res.status(400).json({ error: porciones.error || menu.error });
  }

  try {
    const { rows: actual } = await pool.query('SELECT estado, id_menu FROM actividades WHERE id_actividad = $1', [id.valor]);
    if (actual.length === 0) return res.status(404).json({ error: 'Actividad no encontrada.' });
    if (actual[0].estado !== 'planificada') {
      return res.status(400).json({ error: 'Solo se pueden editar las actividades planificadas.' });
    }
    if (menu.valor) {
      const { rows } = await pool.query('SELECT 1 FROM menus WHERE id_menu = $1', [menu.valor]);
      if (rows.length === 0) return res.status(400).json({ error: 'El menú elegido no existe.' });
    }

    const { rows } = await pool.query(
      `UPDATE actividades
       SET tipo_actividad = COALESCE($1, tipo_actividad),
           fecha_hora_salida = COALESCE($2, fecha_hora_salida),
           porciones_estimadas = COALESCE($3, porciones_estimadas),
           id_menu = $4
       WHERE id_actividad = $5
       RETURNING *`,
      [tipo_actividad || null, fecha_hora_salida || null, porciones.valor,
       id_menu === undefined ? actual[0].id_menu : menu.valor, id.valor]
    );
    res.json({ mensaje: 'Actividad actualizada correctamente.', actividad: rows[0] });
  } catch (err) {
    console.error('Error al actualizar actividad:', err);
    res.status(500).json({ error: 'No se pudo actualizar la actividad.' });
  }
});

// PUT /:id/cancelar (T23: Liberación al cancelar y validación de estado)
router.put('/:id/cancelar', autenticar, permitirRoles('direccion', 'coordinador_actividad'), async (req, res) => {
  const id = leerId(req.params.id, 'Actividad');
  if (id.error) return res.status(400).json({ error: id.error });

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 1. Verificar el estado actual antes de cancelar
    const { rows: actRows } = await client.query(
      'SELECT estado FROM actividades WHERE id_actividad = $1 FOR UPDATE',
      [id.valor]
    );
    if (actRows.length === 0) throw new ErrorNegocio('Actividad no encontrada.', 404);
    if (actRows[0].estado === 'cancelada') {
      throw new ErrorNegocio('La actividad ya se encuentra cancelada.', 400);
    }
    if (actRows[0].estado === 'realizada') {
      throw new ErrorNegocio('No se puede cancelar una actividad que ya fue realizada.', 400);
    }
    
    // 2. Cancelar la actividad
    const { rows } = await client.query(
      `UPDATE actividades SET estado = 'cancelada' WHERE id_actividad = $1 RETURNING *`,
      [id.valor]
    );
    
    // 3. Liberar lotes devolviéndolos a estado disponible y desvinculando la actividad
    await client.query(
      `UPDATE donaciones SET estado = 'disponible' 
       WHERE id_actividad_reserva = $1 AND estado = 'reservada'`,
      [id.valor]
    );
    await client.query(
      `UPDATE donaciones SET id_actividad_reserva = NULL WHERE id_actividad_reserva = $1`,
      [id.valor]
    );
    
    // 4. Eliminar los pedidos de reposición pendientes asociados
    await client.query(
      `DELETE FROM pedidos_reposicion WHERE id_actividad = $1 AND estado = 'pendiente'`,
      [id.valor]
    );
    
    await client.query('COMMIT');
    res.json({ mensaje: 'Actividad cancelada exitosamente y stock liberado.', actividad: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof ErrorNegocio) return res.status(err.status).json({ error: err.message });
    console.error('Error al cancelar actividad:', err);
    res.status(500).json({ error: 'No se pudo cancelar la actividad.' });
  } finally {
    client.release();
  }
});


//PUT /:id/consumo
router.put('/:id/consumo', autenticar, permitirRoles('coordinador_actividad', 'direccion'), async (req, res) => {
  const id = leerId(req.params.id, 'Actividad');
  if (id.error) return res.status(400).json({ error: id.error });

  //utilizar la validación estandarizada para rechazar vacíos, strings y decimales
  const porciones = leerNumero(req.body.porciones_reales, 'Porciones entregadas', { entero: true });
  if (porciones.error) {
    return res.status(400).json({ error: porciones.error });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    //verificar que la actividad exista y no esté cancelada
    const { rows: actRows } = await client.query(
      'SELECT estado FROM actividades WHERE id_actividad = $1 FOR UPDATE',
      [id.valor]
    );
    if (actRows.length === 0) throw new ErrorNegocio('Actividad no encontrada.', 404);
    if (actRows[0].estado === 'cancelada') {
      throw new ErrorNegocio('No se puede registrar el consumo de una actividad cancelada.', 400);
    }

    const { rows } = await client.query(
      `UPDATE actividades SET porciones_reales = $1, estado = 'realizada' 
       WHERE id_actividad = $2 RETURNING *`,
      [porciones.valor, id.valor]
    );

    await client.query('COMMIT');
    res.json({ mensaje: 'Consumo real registrado correctamente.', actividad: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof ErrorNegocio) return res.status(err.status).json({ error: err.message });
    console.error('Error al registrar consumo:', err);
    res.status(500).json({ error: 'No se pudo registrar el consumo real.' });
  } finally {
    client.release();
  }
});

module.exports = router;