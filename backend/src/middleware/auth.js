const jwt = require('jsonwebtoken');
const pool = require('../db');

// Verifica que el pedido traiga un token válido
function autenticar(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Necesitás iniciar sesión.' });
  }

  try {
    req.usuario = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Tu sesión venció. Volvé a iniciar sesión.' });
  }
}

// Corta la sesión en el momento si el usuario fue desactivado o le cambiaron el perfil después de
// iniciar sesión (el token sigue siendo válido hasta que vence, por eso se consulta la base).
// Se aplica a toda la API antes de las rutas. Si no hay token o no es válido, no hace nada:
// de eso se ocupa autenticar en cada ruta.
async function verificarUsuarioVigente(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return next();

  let datos;
  try {
    datos = jwt.verify(header.slice(7), process.env.JWT_SECRET);
  } catch {
    return next();
  }

  try {
    const { rows } = await pool.query(
      `SELECT u.activo, r.nombre_rol
       FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
       WHERE u.id_usuario = $1`,
      [datos.id]
    );
    if (rows.length === 0 || !rows[0].activo) {
      return res.status(401).json({ error: 'Tu usuario está desactivado. Consultá con la dirección.' });
    }
    if (rows[0].nombre_rol !== datos.rol) {
      return res.status(401).json({ error: 'Tu perfil cambió. Volvé a iniciar sesión.' });
    }
    next();
  } catch (err) {
    console.error('Error al verificar el usuario de la sesión:', err);
    res.status(500).json({ error: 'No se pudo verificar la sesión. Intentá de nuevo.' });
  }
}

// Permite el paso solo a los roles indicados. Dirección siempre puede pasar.
function permitirRoles(...rolesPermitidos) {
  return (req, res, next) => {
    const rol = req.usuario.rol;
    if (rol === 'direccion' || rolesPermitidos.includes(rol)) {
      return next();
    }
    return res.status(403).json({ error: 'Tu perfil no tiene acceso a esta función.' });
  };
}

module.exports = { autenticar, verificarUsuarioVigente, permitirRoles };