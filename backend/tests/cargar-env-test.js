// Carga backend/.env.test antes de cada archivo de pruebas y antes de "npm run db:test".
// Así las pruebas usan la base suma_voluntades_test y nunca la base real (T43).
// dotenv no pisa variables ya cargadas, por eso este archivo tiene que correr antes que src/db.js.
// Silencia el aviso "injected env" que imprime dotenv, así la salida de las pruebas queda limpia.
process.env.DOTENV_CONFIG_QUIET = 'true';

const path = require('path');
const fs = require('fs');

const archivo = path.join(__dirname, '..', '.env.test');
if (fs.existsSync(archivo)) {
  require('dotenv').config({ path: archivo, quiet: true });
}
