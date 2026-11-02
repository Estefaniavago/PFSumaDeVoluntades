require('dotenv').config();
const { Pool, types } = require('pg');

// Las columnas DATE (como fecha_vencimiento) se devuelven tal como están guardadas, "AAAA-MM-DD".
// Si se convirtieran a fecha con hora, se tomaría la medianoche del huso del servidor y en otro
// huso podría verse como el día anterior.
types.setTypeParser(types.builtins.DATE, valor => valor);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = pool;
