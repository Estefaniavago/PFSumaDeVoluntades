require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../src/db');

const usuarios = [
  ['Carla Puerta',    'puerta@pooltech.test',     'referente_puerta'],
  ['Marcos Coordina', 'coordinador@pooltech.test','coordinador_actividad'],
  ['Elena Depósito',  'deposito@pooltech.test',   'encargado_deposito'],
  ['Dirección',       'direccion@pooltech.test',  'direccion'],
];

(async () => {
  const hash = await bcrypt.hash('Prueba123!', 10);
  for (const [nombre, email, rol] of usuarios) {
    await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, id_rol)
       SELECT $1, $2, $3, id_rol FROM roles WHERE nombre_rol = $4
       ON CONFLICT (email) DO NOTHING`,
      [nombre, email, hash, rol]
    );
  }
  console.log('Usuarios de prueba creados. Contraseña de todos: Prueba123!');
  await pool.end();
})();