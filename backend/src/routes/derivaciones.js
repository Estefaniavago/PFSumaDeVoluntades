const express = require('express');
const router = express.Router();
const pool = require('../db');
const { autenticar, permitirRoles } = require('../middleware/auth');

class ErrorNegocio extends Error {}


// GET /destinos
router.get('/destinos', autenticar, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id_destino, nombre, tipo FROM destinos ORDER BY nombre ASC'
    );
    res.json(rows);
  } catch (err) {
    console.error('Error al listar destinos:', err);
    res.status(500).json({ error: 'No se pudo consultar el listado de destinos.' });
  }
});

// POST /destinos
router.post('/destinos', autenticar, permitirRoles('direccion', 'encargado_deposito'), async (req, res) => {
  const { nombre, tipo } = req.body;

  if (!nombre) {
    return res.status(400).json({ error: 'El nombre del destino es obligatorio.' });
  }

  const tipoDestino = tipo || 'comedor';
  if (!['comedor', 'otra_org'].includes(tipoDestino)) {
    return res.status(400).json({ error: "El tipo de destino debe ser 'comedor' u 'otra_org'." });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO destinos (nombre, tipo) VALUES ($1, $2) RETURNING *`,
      [nombre.trim(), tipoDestino]
    );
    res.status(201).json({
      mensaje: 'Destino registrado correctamente.',
      destino: rows[0]
    });
  } catch (err) {
    console.error('Error al crear destino:', err);
    res.status(500).json({ error: 'No se pudo registrar el destino.' });
  }
});


// POST /derivaciones
router.post('/',
  autenticar,
  permitirRoles('encargado_deposito', 'direccion'),
  async (req, res) => {
    const { id_donacion, id_destino, cantidad, motivo } = req.body;

    if (!id_donacion || !id_destino || !cantidad || cantidad <= 0 || !motivo) {
      return res.status(400).json({ 
        error: 'Faltan datos obligatorios: id_donacion, id_destino, cantidad (mayor a 0) y motivo.' 
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      //Verificar stock
      const { rows: stockRows } = await client.query(
        `SELECT COALESCE(SUM(cantidad), 0) AS disponible 
         FROM movimientos 
         WHERE id_donacion = $1`,
        [id_donacion]
      );
      const disponible = parseFloat(stockRows[0].disponible);

      if (cantidad > disponible) {
        throw new ErrorNegocio(`Stock insuficiente en el lote seleccionado. Disponible: ${disponible}, solicitado: ${cantidad}`);
      }

      // Verificar que el destino exista
      const { rows: destRows } = await client.query(
        'SELECT id_destino FROM destinos WHERE id_destino = $1',
        [id_destino]
      );
      if (destRows.length === 0) {
        throw new ErrorNegocio('El destino seleccionado no existe.');
      }

      // Registrar el movimiento
      const { rows: movRows } = await client.query(
        `INSERT INTO movimientos (id_donacion, id_usuario, id_destino, tipo_movimiento, cantidad, motivo)
         VALUES ($1, $2, $3, 'derivacion', $4, $5)
         RETURNING id_movimiento, fecha_hora`,
        [
          id_donacion,
          req.usuario.id,
          id_destino,
          -Math.abs(cantidad),
          motivo.trim()
        ]
      );

      await client.query('COMMIT');
      res.status(201).json({
        mensaje: 'Derivación de mercadería registrada correctamente.',
        movimiento: {
          id_movimiento: movRows[0].id_movimiento,
          id_donacion,
          id_destino,
          cantidad_derivada: cantidad,
          fecha_hora: movRows[0].fecha_hora
        }
      });
    } catch (err) {
      await client.query('ROLLBACK');
      if (err instanceof ErrorNegocio) {
        return res.status(400).json({ error: err.message });
      }
      console.error('Error al registrar derivación:', err);
      res.status(500).json({ error: 'No se pudo registrar la derivación de mercadería.' });
    } finally {
      client.release();
    }
  }
);

module.exports = router;