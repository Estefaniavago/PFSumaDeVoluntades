const express = require('express');
const router = express.Router();
const pool = require('../db');
const { autenticar, permitirRoles } = require('../middleware/auth');
const { leerNumero } = require('../validaciones');

const CATEGORIAS = ['alimento', 'limpieza', 'mobiliario', 'ropa', 'descartable', 'dinero'];

// Evita duplicados escritos distinto: "arroz" y "Arroz" son el mismo producto
async function nombreRepetido(nombre, idExcluido = null) {
  const { rows } = await pool.query(
    'SELECT 1 FROM productos WHERE LOWER(nombre) = LOWER($1) AND id_producto IS DISTINCT FROM $2',
    [nombre, idExcluido]
  );
  return rows.length > 0;
}

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

// POST /productos - Crear un nuevo producto.
// RF-03: quien registra un ingreso puede dar de alta en el momento un producto que no esté en el
// catálogo. Si lo crea el referente de puerta, el mínimo queda en 0 y lo completa la dirección.
router.post('/', autenticar, permitirRoles('encargado_deposito', 'referente_puerta'), async (req, res) => {
  const { nombre, categoria, unidad_medida, perecedero } = req.body;

  if (!nombre || !String(nombre).trim() || !categoria || !unidad_medida || !String(unidad_medida).trim()) {
    return res.status(400).json({ error: 'El nombre, la categoría y la unidad de medida son obligatorios.' });
  }
  if (!CATEGORIAS.includes(categoria)) {
    return res.status(400).json({ error: `Categoría inválida. Debe ser una de: ${CATEGORIAS.join(', ')}` });
  }

  let minimo = 0;
  if (req.usuario.rol !== 'referente_puerta' && req.body.minimo_deseable !== undefined && req.body.minimo_deseable !== '') {
    const leido = leerNumero(req.body.minimo_deseable, 'Mínimo deseable', { permitirCero: true });
    if (leido.error) return res.status(400).json({ error: leido.error });
    minimo = leido.valor;
  }

  try {
    // Si el producto existía y se había dado de baja, se vuelve a activar con los datos nuevos
    // (el nombre no se puede repetir y su historial de movimientos se conserva)
    const { rows: dadoDeBaja } = await pool.query(
      `UPDATE productos SET categoria = $2, unidad_medida = $3, minimo_deseable = $4, perecedero = $5, activo = TRUE
       WHERE LOWER(nombre) = LOWER($1) AND activo = FALSE
       RETURNING *`,
      [String(nombre).trim(), categoria, String(unidad_medida).trim(), minimo, Boolean(perecedero)]
    );
    if (dadoDeBaja.length) {
      return res.status(201).json({ mensaje: 'El producto estaba dado de baja y se volvió a activar.', producto: dadoDeBaja[0] });
    }

    if (await nombreRepetido(String(nombre).trim())) {
      return res.status(400).json({ error: 'Ya existe un producto con ese nombre.' });
    }

    const { rows } = await pool.query(
      `INSERT INTO productos (nombre, categoria, unidad_medida, minimo_deseable, perecedero, activo)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING *`,
      [String(nombre).trim(), categoria, String(unidad_medida).trim(), minimo, Boolean(perecedero)]
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
    const nuevoNombre = nombre !== undefined ? String(nombre).trim() : prodActual.nombre;
    const nuevaCategoria = categoria !== undefined ? categoria : prodActual.categoria;
    const nuevaUnidad = unidad_medida !== undefined ? String(unidad_medida).trim() : prodActual.unidad_medida;

    if (!nuevoNombre || !nuevaUnidad) {
      return res.status(400).json({ error: 'El nombre y la unidad de medida no pueden quedar vacíos.' });
    }
    if (!CATEGORIAS.includes(nuevaCategoria)) {
      return res.status(400).json({ error: `Categoría inválida. Debe ser una de: ${CATEGORIAS.join(', ')}` });
    }
    let nuevoMinimo = prodActual.minimo_deseable;
    if (minimo_deseable !== undefined) {
      const leido = leerNumero(minimo_deseable, 'Mínimo deseable', { permitirCero: true });
      if (leido.error) return res.status(400).json({ error: leido.error });
      nuevoMinimo = leido.valor;
    }
    if (await nombreRepetido(nuevoNombre, prodActual.id_producto)) {
      return res.status(400).json({ error: 'Ya existe otro producto con ese nombre.' });
    }
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