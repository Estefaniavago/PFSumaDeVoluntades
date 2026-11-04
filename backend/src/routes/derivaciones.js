const express = require('express');
const router = express.Router();
const pool = require('../db');
const { autenticar, permitirRoles } = require('../middleware/auth');
const { leerNumero, leerId } = require('../validaciones');
const { ErrorNegocio, bloquearLote, cerrarLoteSiSeAgoto } = require('../lotes');


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

// PUT /destinos/:id - Corregir el nombre o el tipo de un destino. No se borran: las derivaciones
// ya registradas tienen que seguir mostrando a dónde fue la mercadería (RNF-07).
router.put('/destinos/:id', autenticar, permitirRoles('direccion', 'encargado_deposito'), async (req, res) => {
  const id = leerId(req.params.id, 'Destino');
  if (id.error) return res.status(400).json({ error: id.error });
  const { nombre, tipo } = req.body;

  if (nombre !== undefined && !String(nombre).trim()) {
    return res.status(400).json({ error: 'El nombre del destino no puede quedar vacío.' });
  }
  if (tipo !== undefined && !['comedor', 'otra_org'].includes(tipo)) {
    return res.status(400).json({ error: "El tipo de destino debe ser 'comedor' u 'otra_org'." });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE destinos SET nombre = COALESCE($1, nombre), tipo = COALESCE($2, tipo)
       WHERE id_destino = $3 RETURNING *`,
      [nombre !== undefined ? String(nombre).trim() : null, tipo || null, id.valor]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Destino no encontrado.' });
    res.json({ mensaje: 'Destino actualizado correctamente.', destino: rows[0] });
  } catch (err) {
    console.error('Error al actualizar destino:', err);
    res.status(500).json({ error: 'No se pudo actualizar el destino.' });
  }
});


// POST /derivaciones
router.post('/',
  autenticar,
  permitirRoles('encargado_deposito', 'direccion'),
  async (req, res) => {
    const { id_donacion, id_destino, motivo } = req.body;

    const lote = leerId(id_donacion, 'Lote (id_donacion)');
    const destino = leerId(id_destino, 'Destino (id_destino)');
    const cantidad = leerNumero(req.body.cantidad, 'Cantidad');
    const error = lote.error || destino.error || cantidad.error ||
      (!motivo || !String(motivo).trim() ? 'Indicá el motivo de la derivación.' : null);
    if (error) {
      return res.status(400).json({ error });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Bloquear el lote y verificar que alcance
      const { saldo } = await bloquearLote(client, lote.valor);
      if (cantidad.valor > saldo) {
        throw new ErrorNegocio(`Stock insuficiente en el lote seleccionado. Disponible: ${saldo}, solicitado: ${cantidad.valor}.`);
      }

      // Verificar que el destino exista
      const { rows: destRows } = await client.query(
        'SELECT id_destino FROM destinos WHERE id_destino = $1',
        [destino.valor]
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
          lote.valor,
          req.usuario.id,
          destino.valor,
          -cantidad.valor,
          String(motivo).trim()
        ]
      );

      // Si el lote quedó vacío, pasa a "derivada"
      await cerrarLoteSiSeAgoto(client, lote.valor, 'derivada');

      await client.query('COMMIT');
      res.status(201).json({
        mensaje: 'Derivación de mercadería registrada correctamente.',
        movimiento: {
          id_movimiento: movRows[0].id_movimiento,
          id_donacion: lote.valor,
          id_destino: destino.valor,
          cantidad_derivada: cantidad.valor,
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