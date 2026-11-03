const express = require('express');
const router = express.Router();
const pool = require('../db');
const { autenticar, permitirRoles } = require('../middleware/auth');
const { leerNumero, leerId } = require('../validaciones');
const { ErrorNegocio } = require('../lotes');

// GET /menu
router.get('/', autenticar, async (req, res) => {
  try {
    const query = `
      SELECT 
        m.id_menu,
        m.nombre_menu,
        m.temporada,
        m.rendimiento_porciones,
        COALESCE(
          json_agg(
            json_build_object(
              'id_menu_insumo', mi.id_menu_insumo,
              'id_producto', p.id_producto,
              'nombre_producto', p.nombre,
              'unidad_medida', p.unidad_medida,
              'cantidad_por_porcion', mi.cantidad_por_porcion
            )
          ) FILTER (WHERE mi.id_menu_insumo IS NOT NULL),
          '[]'
        ) AS insumos
      FROM menus m
      LEFT JOIN menu_insumos mi ON m.id_menu = mi.id_menu
      LEFT JOIN productos p ON mi.id_producto = p.id_producto
      GROUP BY m.id_menu
      ORDER BY m.nombre_menu ASC;
    `;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (err) {
    console.error('Error al listar menús:', err);
    res.status(500).json({ error: 'No se pudo obtener el listado de menús.' });
  }
});

// POST /menu
router.post('/', autenticar, permitirRoles('direccion'), async (req, res) => {
  const { nombre_menu, temporada, insumos } = req.body;

  if (!nombre_menu || !String(nombre_menu).trim() || !temporada || !Array.isArray(insumos) || insumos.length === 0) {
    return res.status(400).json({ error: 'Faltan datos obligatorios o la lista de insumos está vacía.' });
  }
  const rendimiento = leerNumero(req.body.rendimiento_porciones ?? 100, 'Rendimiento en porciones', { entero: true });
  if (rendimiento.error) {
    return res.status(400).json({ error: rendimiento.error });
  }

  if (!['invierno', 'verano'].includes(temporada)) {
    return res.status(400).json({ error: "La temporada debe ser 'invierno' o 'verano'." });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    //insertar el menú principal
    const { rows: menuRows } = await client.query(
      `INSERT INTO menus (nombre_menu, temporada, rendimiento_porciones)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [String(nombre_menu).trim(), temporada, rendimiento.valor]
    );
    const idMenu = menuRows[0].id_menu;

    // insertar los insumos del menú
    for (const insumo of insumos) {
      const producto = leerId(insumo && insumo.id_producto, 'Insumo (id_producto)');
      const cantidad = leerNumero(insumo && insumo.cantidad_por_porcion, 'Cantidad por porción');
      if (producto.error || cantidad.error) {
        throw new ErrorNegocio(producto.error || cantidad.error);
      }
      await client.query(
        `INSERT INTO menu_insumos (id_menu, id_producto, cantidad_por_porcion)
         VALUES ($1, $2, $3)`,
        [idMenu, producto.valor, cantidad.valor]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({
      mensaje: 'Menú creado correctamente con sus insumos.',
      menu: menuRows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof ErrorNegocio) {
      return res.status(400).json({ error: err.message });
    }
    console.error('Error al crear menú:', err);
    res.status(500).json({ error: 'No se pudo registrar el menú.' });
  } finally {
    client.release();
  }
});

// DELETE /menus/:id
router.delete('/:id', autenticar, permitirRoles('direccion'), async (req, res) => {
  const { id } = req.params;
  try {
    const { rowCount } = await pool.query('DELETE FROM menus WHERE id_menu = $1', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Menú no encontrado.' });
    }
    res.json({ mensaje: 'Menú eliminado correctamente.' });
  } catch (err) {
    console.error('Error al eliminar menú:', err);
    res.status(500).json({ error: 'No se pudo eliminar el menú (puede estar asociado a actividades).' });
  }
});

module.exports = router;