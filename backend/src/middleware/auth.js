const jwt = require('jsonwebtoken');

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

module.exports = { autenticar, permitirRoles };