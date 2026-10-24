const express = require('express');
const router = express.Router();
const pool = require('../db');
const { autenticar, permitirRoles } = require('../middleware/auth');

// GET /productos - Listar productos activos (Todos los usuarios con sesión)
router.get('/', autenticar, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id_producto, nombre, categoria, unidad_medida, minimo_deseable, perecedero, activo FROM productos WHERE activo = TRUE ORDER BY nombre'
    );
    res.json(rows);
  } catch (err) {
    console.error('Error al listar productos:', err);
    res.status(500).json({ error: 'No se pudo consultar el catálogo de productos.' });
  }
});

// POST /productos - Crear un nuevo producto (Dirección y Encargado de depósito)
router.post('/', autenticar, permitirRoles('direccion', 'encargado_deposito'), async (req, res) => {
  const { nombre, categoria, unidad_medida, minimo_deseable, perecedero } = req.body;

  if (!nombre || !categoria || !unidad_medida) {
    return res.status(400).json({ error: 'El nombre, la categoría y la unidad de medida son obligatorios.' });
  }

  const categoriasValidas = ['alimento', 'limpieza', 'mobiliario', 'ropa', 'descartable', 'dinero'];
  if (!categoriasValidas.includes(categoria)) {
    return res.status(400).json({ error: `Categoría inválida. Debe ser una de: ${categoriasValidas.join(', ')}` });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO productos (nombre, categoria, unidad_medida, minimo_deseable, perecedero, activo)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING *`,
      [nombre.trim(), categoria, unidad_medida.trim(), minimo_deseable || 0, Boolean(perecedero)]
    );
    res.status(201).json({
      mensaje: 'Producto creado exitosamente.',
      producto: rows[0]
    });
  } catch (err) {
    console.error('Error al crear producto:', err);
    if (err.code === '23505') { // Violación de índice único (nombre repetido)
      return res.status(400).json({ error: 'Ya existe un producto con ese nombre.' });
    }
    res.status(500).json({ error: 'No se pudo registrar el producto.' });
  }
});

// PUT /productos/:id - Actualizar un producto existente (Dirección y Encargado de depósito)
router.put('/:id', autenticar, permitirRoles('direccion', 'encargado_deposito'), async (req, res) => {
  const { id } = req.params;
  const { nombre, categoria, unidad_medida, minimo_deseable, perecedero, activo } = req.body;

  try {
    // Verificar que el producto exista
    const { rows: prodExistente } = await pool.query('SELECT * FROM productos WHERE id_producto = $1', [id]);
    if (prodExistente.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    const prodActual = prodExistente[0];
    const nuevoNombre = nombre !== undefined ? nombre.trim() : prodActual.nombre;
    const nuevaCategoria = categoria !== undefined ? categoria : prodActual.categoria;
    const nuevaUnidad = unidad_medida !== undefined ? unidad_medida.trim() : prodActual.unidad_medida;
    const nuevoMinimo = minimo_deseable !== undefined ? minimo_deseable : prodActual.minimo_deseable;
    const nuevoPerecedero = perecedero !== undefined ? Boolean(perecedero) : prodActual.perecedero;
    const nuevoActivo = activo !== undefined ? Boolean(activo) : prodActual.activo;

    const { rows } = await pool.query(
      `UPDATE productos 
       SET nombre = $1, categoria = $2, unidad_medida = $3, minimo_deseable = $4, perecedero = $5, activo = $6
       WHERE id_producto = $7
       RETURNING *`,
      [nuevoNombre, nuevaCategoria, nuevaUnidad, nuevoMinimo, nuevoPerecedero, nuevoActivo, id]
    );

    res.json({
      mensaje: 'Producto actualizado exitosamente.',
      producto: rows[0]
    });
  } catch (err) {
    console.error('Error al actualizar producto:', err);
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Ya existe otro producto con ese nombre.' });
    }
    res.status(500).json({ error: 'No se pudo actualizar el producto.' });
  }
});

// DELETE /productos/:id - Baja lógica de un producto (activo = FALSE)
router.delete('/:id', autenticar, permitirRoles('direccion', 'encargado_deposito'), async (req, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      `UPDATE productos SET activo = FALSE WHERE id_producto = $1 RETURNING id_producto, nombre, activo`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    res.json({
      mensaje: 'Producto dado de baja correctamente.',
      producto: rows[0]
    });
  } catch (err) {
    console.error('Error al dar de baja el producto:', err);
    res.status(500).json({ error: 'No se pudo dar de baja el producto.' });
  }
});

module.exports = router;