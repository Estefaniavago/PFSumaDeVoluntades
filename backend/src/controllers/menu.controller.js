const pool = require('../db');

// Crear un menú y asociarle sus insumos y cantidades por porción
const crearMenu = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { nombre_menu, temporada, rendimiento_porciones, insumos } = req.body;


    // 1. Insertar el menú
    const menuQuery = `
      INSERT INTO menus (nombre_menu, temporada, rendimiento_porciones)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const menuValues = [nombre_menu, temporada, rendimiento_porciones || 100];
    const menuResult = await client.query(menuQuery, menuValues);
    const id_menu = menuResult.rows[0].id_menu;

    // 2. Insertar los insumos vinculados al menú
    const insumosCreados = [];
    for (const insumo of insumos) {
      const insumoQuery = `
        INSERT INTO menu_insumos (id_menu, id_producto, cantidad_por_porcion)
        VALUES ($1, $2, $3)
        RETURNING *;
      `;
      const insumoValues = [id_menu, insumo.id_producto, insumo.cantidad_por_porcion];
      const insumoResult = await client.query(insumoQuery, insumoValues);
      insumosCreados.push(insumoResult.rows[0]);
    }

    await client.query('COMMIT');

    res.status(201).json({
      mensaje: 'Menú creado con sus insumos exitosamente',
      menu: menuResult.rows[0],
      insumos: insumosCreados
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'No se pudo crear el menú.' });
  } finally {
    client.release();
  }
};

// Listar todos los menús
const obtenerMenus = async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM menus ORDER BY nombre_menu;');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudieron consultar los menús.' });
  }
};

// Obtener el detalle de un menú con sus ingredientes específicos y unidades de medida
const obtenerDetalleMenu = async (req, res) => {
  const { id } = req.params;
  try {
    const menuQuery = 'SELECT * FROM menus WHERE id_menu = $1;';
    const menuRes = await pool.query(menuQuery, [id]);

    if (menuRes.rows.length === 0) {
      return res.status(404).json({ error: 'Menú no encontrado.' });
    }

    const insumosQuery = `
      SELECT mi.id_menu_insumo, mi.cantidad_por_porcion, p.id_producto, p.nombre as producto_nombre, p.unidad_medida
      FROM menu_insumos mi
      JOIN productos p ON mi.id_producto = p.id_producto
      WHERE mi.id_menu = $1;
    `;
    const insumosRes = await pool.query(insumosQuery, [id]);

    res.json({
      menu: menuRes.rows[0],
      insumos: insumosRes.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo obtener el detalle del menú.' });
  }
};

module.exports = {
  crearMenu,
  obtenerMenus,
  obtenerDetalleMenu
};