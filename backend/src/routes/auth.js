const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Completá el email y la contraseña.' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT u.id_usuario, u.nombre, u.password_hash, u.activo, r.nombre_rol
       FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
       WHERE u.email = $1`,
      [email.trim().toLowerCase()]
    );

    const usuario = rows[0];
    const claveOk = usuario && (await bcrypt.compare(password, usuario.password_hash));

    // Mismo mensaje para email inexistente o clave incorrecta: no revela cuál falló
    if (!usuario || !usuario.activo || !claveOk) {
      return res.status(401).json({ error: 'Email o contraseña incorrectos.' });
    }

    const token = jwt.sign(
      { id: usuario.id_usuario, nombre: usuario.nombre, rol: usuario.nombre_rol },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      usuario: { id: usuario.id_usuario, nombre: usuario.nombre, rol: usuario.nombre_rol },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo iniciar sesión. Intentá de nuevo.' });
  }
});

module.exports = router;