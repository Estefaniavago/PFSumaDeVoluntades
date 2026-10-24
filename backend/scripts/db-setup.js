// Prepara la base de datos.
//   npm run db:reset  -> borra y crea las tablas (schema.sql), carga los datos base y los usuarios de prueba
//   npm run db:seed   -> solo carga los datos base y los usuarios (no borra nada)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { Client } = require('pg');

const carpetaDb = path.join(__dirname, '..', '..', 'database');
const reset = process.argv.includes('--reset');

// Si la base indicada en DATABASE_URL no existe, la crea conectándose a la base "postgres"
async function crearBaseSiFalta() {
  const url = new URL(process.env.DATABASE_URL);
  const nombre = decodeURIComponent(url.pathname.slice(1));
  url.pathname = '/postgres';
  const admin = new Client({ connectionString: url.toString() });
  await admin.connect();
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [nombre]);
    if (!rowCount) {
      await admin.query(`CREATE DATABASE "${nombre.replace(/"/g, '""')}"`);
      console.log(`✔ base ${nombre} creada`);
    }
  } finally {
    await admin.end();
  }
}

async function ejecutar(pool, archivo) {
  const sql = fs.readFileSync(path.join(carpetaDb, archivo), 'utf8');
  await pool.query(sql);
  console.log(`✔ ${archivo}`);
}

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL: copiá backend/.env.example como backend/.env y completalo.');
    process.exitCode = 1;
    return;
  }
  try {
    if (reset) await crearBaseSiFalta();
  } catch (err) {
    console.error('No se pudo conectar a PostgreSQL:', err.message);
    process.exitCode = 1;
    return;
  }
  // La conexión se crea recién ahora, cuando la base ya existe
  const pool = require('../src/db');
  try {
    if (reset) await ejecutar(pool, 'schema.sql');
    await ejecutar(pool, 'seed.sql');

    const { rows: [{ roles }] } = await pool.query('SELECT COUNT(*)::int AS roles FROM roles');
    if (roles !== 4) throw new Error(`Se esperaban 4 roles y hay ${roles}.`);
  } catch (err) {
    console.error('No se pudo preparar la base:', err.message);
    process.exitCode = 1;
    return;
  } finally {
    await pool.end();
  }

  // Los usuarios de prueba se crean con el script que ya existía, ahora que los roles están cargados
  execFileSync(process.execPath, [path.join(__dirname, 'seed-usuarios.js')], { stdio: 'inherit' });
})();
