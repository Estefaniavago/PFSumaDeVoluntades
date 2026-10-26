const express = require('express');
const router = express.Router();
const pool = require('../db');
const { autenticar, permitirRoles } = require('../middleware/auth');

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
  const { id_menu, tipo_actividad, fecha_hora_salida, porciones_estimadas } = req.body;

  const tiposValidos = ['desayuno', 'merienda', 'cena', 'salida_barrios', 'ropero', 'evento'];
  if (!tipo_actividad || !tiposValidos.includes(tipo_actividad) || !fecha_hora_salida || !porciones_estimadas || porciones_estimadas <= 0) {
    return res.status(400).json({ error: 'Datos incompletos o inválidos para crear la actividad.' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO actividades (id_menu, id_coordinador, tipo_actividad, fecha_hora_salida, porciones_estimadas, estado)
       VALUES ($1, $2, $3, $4, $5, 'planificada')
       RETURNING *`,
      [id_menu || null, req.usuario.id, tipo_actividad, fecha_hora_salida, porciones_estimadas]
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

// PUT /actividades/:id/cancelar
router.put('/:id/cancelar', autenticar, permitirRoles('direccion', 'coordinador_actividad'), async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `UPDATE actividades SET estado = 'cancelada' WHERE id_actividad = $1 RETURNING *`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Actividad no encontrada.' });
    }
    res.json({ mensaje: 'Actividad cancelada exitosamente.', actividad: rows[0] });
  } catch (err) {
    console.error('Error al cancelar actividad:', err);
    res.status(500).json({ error: 'No se pudo cancelar la actividad.' });
  }
});

module.exports = router;