// Pruebas unitarias del control de sesión y de perfiles (RF-25, RNF-05).
// Se prueban los middlewares solos, con pedidos y respuestas simulados: no hace falta base de datos.
const jwt = require('jsonwebtoken');
const { autenticar, permitirRoles } = require('../src/middleware/auth');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'clave_solo_para_pruebas_automaticas';

// Respuesta simulada de Express: guarda el código y el cuerpo que se devolverían.
function respuestaSimulada() {
  return {
    statusCode: null,
    body: null,
    status(codigo) { this.statusCode = codigo; return this; },
    json(cuerpo) { this.body = cuerpo; return this; },
  };
}

function pedidoConToken(token) {
  return { headers: token ? { authorization: `Bearer ${token}` } : {} };
}

describe('autenticar: exige una sesión válida', () => {
  test('sin token responde 401 y no deja pasar', () => {
    const res = respuestaSimulada();
    const next = jest.fn();
    autenticar(pedidoConToken(null), res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Necesitás iniciar sesión.' });
    expect(next).not.toHaveBeenCalled();
  });

  test('con un token falso o vencido responde 401', () => {
    const vencido = jwt.sign({ id_usuario: 1, rol: 'direccion' }, process.env.JWT_SECRET, { expiresIn: -10 });
    const falso = jwt.sign({ id_usuario: 1, rol: 'direccion' }, 'otra_clave');
    for (const token of [vencido, falso, 'cualquier-cosa']) {
      const res = respuestaSimulada();
      const next = jest.fn();
      autenticar(pedidoConToken(token), res, next);
      expect(res.statusCode).toBe(401);
      expect(res.body.error).toMatch(/sesión venció/);
      expect(next).not.toHaveBeenCalled();
    }
  });

  test('con un token válido deja pasar y guarda el usuario en el pedido', () => {
    const token = jwt.sign({ id_usuario: 3, rol: 'encargado_deposito' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const req = pedidoConToken(token);
    const next = jest.fn();
    autenticar(req, respuestaSimulada(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.usuario).toMatchObject({ id_usuario: 3, rol: 'encargado_deposito' });
  });
});

describe('permitirRoles: cada perfil accede solo a lo suyo', () => {
  const soloDeposito = permitirRoles('encargado_deposito');

  test('un perfil permitido pasa', () => {
    const next = jest.fn();
    soloDeposito({ usuario: { rol: 'encargado_deposito' } }, respuestaSimulada(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('un perfil no permitido recibe 403 con el mensaje del prototipo', () => {
    for (const rol of ['referente_puerta', 'coordinador_actividad']) {
      const res = respuestaSimulada();
      const next = jest.fn();
      soloDeposito({ usuario: { rol } }, res, next);
      expect(res.statusCode).toBe(403);
      expect(res.body).toEqual({ error: 'Tu perfil no tiene acceso a esta función.' });
      expect(next).not.toHaveBeenCalled();
    }
  });

  test('la dirección pasa siempre, aunque no esté en la lista', () => {
    const next = jest.fn();
    soloDeposito({ usuario: { rol: 'direccion' } }, respuestaSimulada(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
