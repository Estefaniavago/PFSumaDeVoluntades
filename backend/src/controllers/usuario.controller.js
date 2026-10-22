const pool = require('../db');

// Obtener todos los usuarios
const obtenerUsuarios = async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nombre, email, rol, creado_en FROM usuarios ORDER BY nombre'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo consultar la base de datos de usuarios.' });
  }
};

// Crear un nuevo usuario
const crearUsuario = async (req, res) => {
  const { nombre, email, password, rol } = req.body;
  
  try {
    const query = `
      INSERT INTO usuarios (nombre, email, password, rol)
      VALUES ($1, $2, $3, $4)
      RETURNING id, nombre, email, rol, creado_en;
    `;
    const values = [nombre, email, password, rol || 'voluntario'];
    const { rows } = await pool.query(query, values);
    
    res.status(201).json({
      mensaje: 'Usuario creado exitosamente',
      usuario: rows[0]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo registrar el usuario.' });
  }
};

module.exports = {
  obtenerUsuarios,
  crearUsuario
};