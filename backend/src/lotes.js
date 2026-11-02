// Operaciones comunes sobre un lote (una fila de "donaciones") dentro de una transacción.

// Error de negocio: se responde con 400 y el mensaje tal cual.
class ErrorNegocio extends Error {}

// Bloquea el lote hasta el final de la transacción (evita que dos operaciones simultáneas
// lo dejen en negativo) y devuelve su saldo, calculado sumando los movimientos (RNF-08).
async function bloquearLote(client, idDonacion) {
  const { rows } = await client.query(
    'SELECT id_donacion, estado FROM donaciones WHERE id_donacion = $1 FOR UPDATE',
    [idDonacion]
  );
  if (rows.length === 0) {
    throw new ErrorNegocio('El lote indicado no existe.');
  }
  const { rows: [{ saldo }] } = await client.query(
    'SELECT COALESCE(SUM(cantidad), 0) AS saldo FROM movimientos WHERE id_donacion = $1',
    [idDonacion]
  );
  return { estado: rows[0].estado, saldo: Number(saldo) };
}

// Si el lote quedó sin mercadería, pasa al estado final que corresponde
// ('entregada', 'derivada' o 'vencida_descartada').
async function cerrarLoteSiSeAgoto(client, idDonacion, estadoFinal) {
  await client.query(
    `UPDATE donaciones SET estado = $2
     WHERE id_donacion = $1
       AND (SELECT COALESCE(SUM(cantidad), 0) FROM movimientos WHERE id_donacion = $1) <= 0`,
    [idDonacion, estadoFinal]
  );
}

module.exports = { ErrorNegocio, bloquearLote, cerrarLoteSiSeAgoto };
