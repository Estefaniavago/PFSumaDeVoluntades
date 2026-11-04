const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { autenticar, permitirRoles } = require('../middleware/auth');
const { leerId } = require('../validaciones');

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LARGO_MINIMO_CLAVE = 8;

// Revisa los datos que llegan para crear o editar un usuario. En la edición los campos que no
// vienen se dejan como están, por eso solo se valida lo que se manda.
function validarUsuario({ nombre, email, password, id_rol }, esAlta) {
  if (esAlta && (!nombre || !email || !password || !id_rol)) {
    return 'Completá el nombre, el email, la contraseña y el perfil.';
  }
  if (nombre !== undefined && !String(nombre).trim()) return 'El nombre no puede quedar vacío.';
  if (nombre !== undefined && String(nombre).trim().length > 100) return 'El nombre es demasiado largo.';
  if (email !== undefined && !EMAIL_VALIDO.test(String(email).trim())) return 'El email no tiene un formato válido.';
  if (password && String(password).length < LARGO_MINIMO_CLAVE) {
    return `La contraseña tiene que tener al menos ${LARGO_MINIMO_CLAVE} caracteres.`;
  }
  if (id_rol !== undefined && leerId(id_rol, 'Perfil').error) return 'Elegí un perfil válido.';
  return null;
}

async function rolExiste(idRol) {
  const { rows } = await pool.query('SELECT 1 FROM roles WHERE id_rol = $1', [idRol]);
  return rows.length > 0;
}

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

// GET /usuarios/roles - Perfiles disponibles, para el formulario de alta y edición
router.get('/roles', autenticar, permitirRoles('direccion'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id_rol, nombre_rol, descripcion FROM roles ORDER BY id_rol');
    res.json(rows);
  } catch (err) {
    console.error('Error al listar perfiles:', err);
    res.status(500).json({ error: 'No se pudo consultar el listado de perfiles.' });
  }
});

// POST /usuarios
router.post('/', autenticar, permitirRoles('direccion'), async (req, res) => {
  const { nombre, email, password, id_rol } = req.body;

  const error = validarUsuario(req.body, true);
  if (error) return res.status(400).json({ error });

  try {
    if (!(await rolExiste(id_rol))) {
      return res.status(400).json({ error: 'El perfil elegido no es válido.' });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);

    const { rows } = await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, id_rol, activo)
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING id_usuario, nombre, email, id_rol, activo`,
      [String(nombre).trim(), String(email).trim().toLowerCase(), passwordHash, id_rol]
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
  const id = leerId(req.params.id, 'Usuario');
  if (id.error) return res.status(400).json({ error: id.error });
  const { nombre, email, password, id_rol, activo } = req.body;

  const error = validarUsuario(req.body, false);
  if (error) return res.status(400).json({ error });

  // Quien está usando el sistema no puede dejarse sin acceso a sí mismo
  if (id.valor === req.usuario.id && activo === false) {
    return res.status(400).json({ error: 'No podés desactivar tu propio usuario.' });
  }

  try {
    const { rows: userExistente } = await pool.query('SELECT * FROM usuarios WHERE id_usuario = $1', [id.valor]);
    if (userExistente.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const uActual = userExistente[0];
    const nuevoRol = id_rol !== undefined ? Number(id_rol) : uActual.id_rol;
    if (nuevoRol !== uActual.id_rol) {
      if (id.valor === req.usuario.id) {
        return res.status(400).json({ error: 'No podés cambiar tu propio perfil.' });
      }
      if (!(await rolExiste(nuevoRol))) {
        return res.status(400).json({ error: 'El perfil elegido no es válido.' });
      }
    }

    const nuevoNombre = nombre !== undefined ? String(nombre).trim() : uActual.nombre;
    const nuevoEmail = email !== undefined ? String(email).trim().toLowerCase() : uActual.email;
    const nuevoActivo = activo !== undefined ? Boolean(activo) : uActual.activo;
    const passwordHash = password ? await bcrypt.hash(String(password), 10) : uActual.password_hash;

    const { rows } = await pool.query(
      `UPDATE usuarios
       SET nombre = $1, email = $2, password_hash = $3, id_rol = $4, activo = $5
       WHERE id_usuario = $6
       RETURNING id_usuario, nombre, email, id_rol, activo`,
      [nuevoNombre, nuevoEmail, passwordHash, nuevoRol, nuevoActivo, id.valor]
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

// DELETE /usuarios/:id - Baja lógica: el usuario queda desactivado y no puede iniciar sesión.
// No se borra porque sus movimientos tienen que seguir mostrando quién los hizo (RNF-07).
router.delete('/:id', autenticar, permitirRoles('direccion'), async (req, res) => {
  const id = leerId(req.params.id, 'Usuario');
  if (id.error) return res.status(400).json({ error: id.error });
  if (id.valor === req.usuario.id) {
    return res.status(400).json({ error: 'No podés desactivar tu propio usuario.' });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE usuarios SET activo = FALSE WHERE id_usuario = $1 RETURNING id_usuario, nombre, activo`,
      [id.valor]
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
