const pool = require('../db');

// Registrar un nuevo remito con sus respectivas donaciones (lotes)
const registrarRemito = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { nro_remito, id_usuario, donante_nombre, anonima, items } = req.body;
    

    // 1. Insertar el remito principal
    const remitoQuery = `
      INSERT INTO remitos (nro_remito, id_usuario, donante_nombre, anonima)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const remitoValues = [nro_remito, id_usuario, donante_nombre, anonima || false];
    const remitoResult = await client.query(remitoQuery, remitoValues);
    const id_remito = remitoResult.rows[0].id_remito;

    // 2. Insertar cada producto como una donación (lote) asociada al remito
    const donacionesCreadas = [];
    for (const item of items) {
      const donacionQuery = `
        INSERT INTO donaciones (id_producto, id_remito, cantidad_inicial, fecha_vencimiento, estado)
        VALUES ($1, $2, $3, $4, 'recibida')
        RETURNING *;
      `;
      const donacionValues = [
        item.id_producto,
        id_remito,
        item.cantidad_inicial,
        item.fecha_vencimiento || null
      ];
      const donacionResult = await client.query(donacionQuery, donacionValues);
      donacionesCreadas.push(donacionResult.rows[0]);
    }

    await client.query('COMMIT');

    res.status(201).json({
      mensaje: 'Remito y donaciones registradas exitosamente',
      remito: remitoResult.rows[0],
      donaciones: donacionesCreadas
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'No se pudo registrar el remito y sus donaciones.' });
  } finally {
    client.release();
  }
};

// Obtener todos los remitos con datos del usuario que los registró
const obtenerRemitos = async (req, res) => {
  try {
    const query = `
      SELECT r.*, u.nombre as usuario_nombre 
      FROM remitos r 
      JOIN usuarios u ON r.id_usuario = u.id_usuario 
      ORDER BY r.fecha_hora_ingreso DESC;
    `;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudieron consultar los remitos.' });
  }
};

module.exports = {
  registrarRemito,
  obtenerRemitos
};