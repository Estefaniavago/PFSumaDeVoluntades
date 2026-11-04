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

// Carga los insumos de un menú dentro de la transacción. Cada producto puede aparecer una sola vez
// y tiene que existir en el catálogo.
async function guardarInsumos(client, idMenu, insumos) {
  const vistos = new Set();
  for (const insumo of insumos) {
    const producto = leerId(insumo && insumo.id_producto, 'Insumo (id_producto)');
    const cantidad = leerNumero(insumo && insumo.cantidad_por_porcion, 'Cantidad por porción');
    if (producto.error || cantidad.error) {
      throw new ErrorNegocio(producto.error || cantidad.error);
    }
    if (vistos.has(producto.valor)) {
      throw new ErrorNegocio('Un mismo insumo está cargado dos veces en el menú.');
    }
    vistos.add(producto.valor);

    const { rows } = await client.query('SELECT nombre FROM productos WHERE id_producto = $1 AND activo = TRUE', [producto.valor]);
    if (rows.length === 0) {
      throw new ErrorNegocio('Uno de los insumos no existe en el catálogo o está dado de baja.');
    }
    await client.query(
      `INSERT INTO menu_insumos (id_menu, id_producto, cantidad_por_porcion)
       VALUES ($1, $2, $3)`,
      [idMenu, producto.valor, cantidad.valor]
    );
  }
}

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

    await guardarInsumos(client, idMenu, insumos);

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

// PUT /menus/:id - Editar el nombre, la temporada y el rendimiento de los insumos (RF-15).
// La lista de insumos que llega reemplaza a la anterior. Los cambios se aplican a los cálculos
// de las actividades que usan el menú.
router.put('/:id', autenticar, permitirRoles('direccion'), async (req, res) => {
  const id = leerId(req.params.id, 'Menú');
  if (id.error) return res.status(400).json({ error: id.error });
  const { nombre_menu, temporada, insumos } = req.body;

  if (nombre_menu !== undefined && !String(nombre_menu).trim()) {
    return res.status(400).json({ error: 'El nombre del menú no puede quedar vacío.' });
  }
  if (temporada !== undefined && !['invierno', 'verano'].includes(temporada)) {
    return res.status(400).json({ error: "La temporada debe ser 'invierno' o 'verano'." });
  }
  if (insumos !== undefined && (!Array.isArray(insumos) || insumos.length === 0)) {
    return res.status(400).json({ error: 'El menú tiene que tener al menos un insumo.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE menus SET nombre_menu = COALESCE($1, nombre_menu), temporada = COALESCE($2, temporada)
       WHERE id_menu = $3 RETURNING *`,
      [nombre_menu !== undefined ? String(nombre_menu).trim() : null, temporada || null, id.valor]
    );
    if (rows.length === 0) throw new ErrorNegocio('Menú no encontrado.', 404);

    if (insumos) {
      await client.query('DELETE FROM menu_insumos WHERE id_menu = $1', [id.valor]);
      await guardarInsumos(client, id.valor, insumos);
    }

    await client.query('COMMIT');
    res.json({ mensaje: 'Menú actualizado correctamente.', menu: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof ErrorNegocio) return res.status(err.status).json({ error: err.message });
    console.error('Error al actualizar menú:', err);
    res.status(500).json({ error: 'No se pudo actualizar el menú.' });
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
    if (err.code === '23503') { // Lo usa alguna actividad
      return res.status(400).json({ error: 'No se puede eliminar el menú porque hay actividades que lo usan.' });
    }
    console.error('Error al eliminar menú:', err);
    res.status(500).json({ error: 'No se pudo eliminar el menú (puede estar asociado a actividades).' });
  }
});

module.exports = router;