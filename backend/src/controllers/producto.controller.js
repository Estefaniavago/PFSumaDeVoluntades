const pool = require('../db');

const obtenerProductos = async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM productos WHERE activo = TRUE ORDER BY nombre'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo consultar la base de datos.' });
  }
};

module.exports = { obtenerProductos };