// Pruebas de integración (consigna, punto 6): interfaz de la API + lógica + base de datos real.
// Se hacen pedidos HTTP a la aplicación con Supertest y se verifica el resultado en PostgreSQL.
//
// Usan la base de PRUEBAS (backend/.env.test). Antes de correrlas:
//   npm run db:test   -> crea suma_voluntades_test con el esquema, los datos base y los usuarios
//   npm test
// Se pueden repetir sin volver a crear la base: comparan el stock de antes y de después.
const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db');

// Protección: si DATABASE_URL no apunta a una base terminada en _test, no se ejecuta nada.
const nombreBase = process.env.DATABASE_URL
  ? decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1))
  : '';
if (!nombreBase.endsWith('_test')) {
  throw new Error(
    `Las pruebas de integración solo corren sobre una base de pruebas (nombre terminado en _test). ` +
    `Base configurada: "${nombreBase || 'ninguna'}". Revisá backend/.env.test.`
  );
}

const CLAVE = 'Prueba123!'; // la de los usuarios de prueba que crea npm run db:test

async function iniciarSesion(email) {
  const res = await request(app).post('/login').send({ email, password: CLAVE });
  expect(res.status).toBe(200);
  return res.body.token;
}

async function stockDe(token, nombreProducto) {
  const res = await request(app).get('/stock').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  return res.body.find(p => p.nombre === nombreProducto);
}

afterAll(() => pool.end());

describe('Integración 1: registrar una donación y verla en el stock (RF-01, RF-04)', () => {
  test('la donación se guarda en la base y el stock del producto aumenta', async () => {
    // Paso 1: el encargado de depósito inicia sesión.
    const token = await iniciarSesion('deposito@pooltech.test');

    // Paso 2: consulta el stock de aceite antes de la donación.
    const antes = await stockDe(token, 'Aceite');
    expect(antes).toBeDefined();
    const stockAntes = parseFloat(antes.stock_total);

    // Paso 3: registra una donación de 12,5 litros de aceite.
    const alta = await request(app)
      .post('/donaciones')
      .set('Authorization', `Bearer ${token}`)
      .send({ donante_nombre: 'Prueba de integración', items: [{ id_producto: antes.id_producto, cantidad: 12.5 }] });

    expect(alta.status).toBe(201);
    expect(alta.body.mensaje).toBe('Donación registrada.');
    expect(alta.body.remito.nro_remito).toMatch(/^R-\d{6}$/);

    // Paso 4: el stock que muestra la API sumó los 12,5 litros y aparece el lote nuevo con su remito.
    const despues = await stockDe(token, 'Aceite');
    expect(parseFloat(despues.stock_total)).toBeCloseTo(stockAntes + 12.5, 2);
    const loteNuevo = despues.lotes.find(l => l.nro_remito === alta.body.remito.nro_remito);
    expect(loteNuevo).toMatchObject({ estado_lote: 'disponible' });
    expect(parseFloat(loteNuevo.cantidad_actual)).toBe(12.5);

    // Paso 5: en la base quedaron el remito, el lote y el movimiento de ingreso (todo en una transacción).
    const { rows } = await pool.query(
      `SELECT r.donante_nombre, d.cantidad_inicial, m.tipo_movimiento, m.cantidad
       FROM remitos r
       JOIN donaciones d ON d.id_remito = r.id_remito
       JOIN movimientos m ON m.id_donacion = d.id_donacion
       WHERE r.nro_remito = $1`,
      [alta.body.remito.nro_remito]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].donante_nombre).toBe('Prueba de integración');
    expect(rows[0].tipo_movimiento).toBe('ingreso');
    expect(parseFloat(rows[0].cantidad)).toBe(12.5);
  });

  test('una donación con datos inválidos se rechaza y no cambia el stock', async () => {
    const token = await iniciarSesion('deposito@pooltech.test');
    const antes = await stockDe(token, 'Aceite');

    const alta = await request(app)
      .post('/donaciones')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ id_producto: antes.id_producto, cantidad: 0 }] });

    expect(alta.status).toBe(400);
    expect(alta.body.error).toBe('Ítem 1: la cantidad debe ser mayor que cero.');

    const despues = await stockDe(token, 'Aceite');
    expect(despues.stock_total).toBe(antes.stock_total);
    expect(despues.lotes).toHaveLength(antes.lotes.length);
  });
});

describe('Integración 2: cada perfil accede solo a lo suyo (RF-25, RNF-05)', () => {
  test('el referente de puerta no puede crear usuarios: recibe 403 y no se guarda nada', async () => {
    const token = await iniciarSesion('puerta@pooltech.test');
    const email = `intruso.${Date.now()}@pooltech.test`;

    const res = await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Usuario no autorizado', email, password: 'Clave1234!', id_rol: 1 });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Tu perfil no tiene acceso a esta función.');

    const { rowCount } = await pool.query('SELECT 1 FROM usuarios WHERE email = $1', [email]);
    expect(rowCount).toBe(0);
  });

  test('el referente de puerta tampoco ve el stock, y sin sesión no se accede', async () => {
    const token = await iniciarSesion('puerta@pooltech.test');
    const conPerfilPuerta = await request(app).get('/stock').set('Authorization', `Bearer ${token}`);
    expect(conPerfilPuerta.status).toBe(403);

    const sinSesion = await request(app).get('/stock');
    expect(sinSesion.status).toBe(401);
    expect(sinSesion.body.error).toBe('Necesitás iniciar sesión.');
  });

  test('con una contraseña incorrecta no se inicia sesión', async () => {
    const res = await request(app).post('/login').send({ email: 'deposito@pooltech.test', password: 'equivocada' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Email o contraseña incorrectos.');
    expect(res.body.token).toBeUndefined();
  });
});
