const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { autenticar, permitirRoles } = require('../middleware/auth');

class ErrorNegocio extends Error {}

// GET /usuarios
router.get('/', autenticar, permitirRoles('direccion'), async (req, res) => {
  try {
    const query = `
      SELECT u.id_usuario, u.nombre, u.email, u.activo, r.id_rol, r.nombre_rol
      FROM usuarios u
      JOIN roles r ON u.id_rol = r.id_rol
      ORDER BY u.nombre ASC;
    `;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (err) {
    console.error('Error al listar usuarios:', err);
    res.status(500).json({ error: 'No se pudo consultar el listado de usuarios.' });
  }
});

// POST /usuarios
router.post('/', autenticar, permitirRoles('direccion'), async (req, res) => {
  const { nombre, email, password, id_rol } = req.body;

  if (!nombre || !email || !password || !id_rol) {
    return res.status(400).json({ error: 'Faltan datos obligatorios: nombre, email, password y id_rol.' });
  }

  try {
    // verificar que el rol exista
    const { rows: rolRows } = await pool.query('SELECT id_rol FROM roles WHERE id_rol = $1', [id_rol]);
    if (rolRows.length === 0) {
      return res.status(400).json({ error: 'El rol especificado no es válido.' });
    }

    // generar el hash de la contraseña
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // insertar el usuario
    const { rows } = await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, id_rol, activo)
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING id_usuario, nombre, email, id_rol, activo`,
      [nombre.trim(), email.trim().toLowerCase(), passwordHash, id_rol]
    );

    res.status(201).json({
      mensaje: 'Usuario creado exitosamente.',
      usuario: rows[0]
    });
  } catch (err) {
    console.error('Error al crear usuario:', err);
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Ya existe un usuario registrado con ese email.' });
    }
    res.status(500).json({ error: 'No se pudo registrar el usuario.' });
  }
});

// PUT /usuarios/:id
router.put('/:id', autenticar, permitirRoles('direccion'), async (req, res) => {
  const { id } = req.params;
  const { nombre, email, password, id_rol, activo } = req.body;

  try {
    const { rows: userExistente } = await pool.query('SELECT * FROM usuarios WHERE id_usuario = $1', [id]);
    if (userExistente.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const uActual = userExistente[0];
    const nuevoNombre = nombre !== undefined ? nombre.trim() : uActual.nombre;
    const nuevoEmail = email !== undefined ? email.trim().toLowerCase() : uActual.email;
    const nuevoRol = id_rol !== undefined ? id_rol : uActual.id_rol;
    const nuevoActivo = activo !== undefined ? Boolean(activo) : uActual.activo;

    let passwordHash = uActual.password_hash;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      passwordHash = await bcrypt.hash(password, salt);
    }

    const { rows } = await pool.query(
      `UPDATE usuarios 
       SET nombre = $1, email = $2, password_hash = $3, id_rol = $4, activo = $5
       WHERE id_usuario = $6
       RETURNING id_usuario, nombre, email, id_rol, activo`,
      [nuevoNombre, nuevoEmail, passwordHash, nuevoRol, nuevoActivo, id]
    );

    res.json({
      mensaje: 'Usuario actualizado correctamente.',
      usuario: rows[0]
    });
  } catch (err) {
    console.error('Error al actualizar usuario:', err);
    if (err.code === '23505') {
      return res.status(400).json({ error: 'El email ingresado ya pertenece a otro usuario.' });
    }
    res.status(500).json({ error: 'No se pudo actualizar el usuario.' });
  }
});

// DELETE /usuarios/:id
router.delete('/:id', autenticar, permitirRoles('direccion'), async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `UPDATE usuarios SET activo = FALSE WHERE id_usuario = $1 RETURNING id_usuario, nombre, activo`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    res.json({
      mensaje: 'Usuario desactivado correctamente.',
      usuario: rows[0]
    });
  } catch (err) {
    console.error('Error al desactivar usuario:', err);
    res.status(500).json({ error: 'No se pudo desactivar el usuario.' });
  }
});

module.exports = router;