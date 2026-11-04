const express = require('express');
const router = express.Router();
const pool = require('../db');
const { autenticar } = require('../middleware/auth');
const { leerId } = require('../validaciones');

// GET /remitos/:id - Comprobante de ingreso de una donación (RF-02): número, fecha y hora, quién la
// recibió, el donante (o "anónima") y lo que llegó. Lo puede ver cualquier usuario con sesión,
// incluido el referente de puerta que cargó la donación.
router.get('/:id', autenticar, async (req, res) => {
  const id = leerId(req.params.id, 'Remito');
  if (id.error) return res.status(400).json({ error: id.error });

  try {
    const { rows: remitos } = await pool.query(
      `SELECT r.id_remito, r.nro_remito, r.fecha_hora_ingreso, r.donante_nombre, r.anonima,
              u.nombre AS recibido_por
       FROM remitos r
       JOIN usuarios u ON u.id_usuario = r.id_usuario
       WHERE r.id_remito = $1`,
      [id.valor]
    );
    if (remitos.length === 0) return res.status(404).json({ error: 'Remito no encontrado.' });

    const { rows: items } = await pool.query(
      `SELECT d.id_donacion, p.nombre AS producto, p.categoria, p.unidad_medida,
              d.cantidad_inicial, d.fecha_vencimiento
       FROM donaciones d
       JOIN productos p ON p.id_producto = d.id_producto
       WHERE d.id_remito = $1
       ORDER BY d.id_donacion`,
      [id.valor]
    );

    res.json({ ...remitos[0], items });
  } catch (err) {
    console.error('Error al consultar el remito:', err);
    res.status(500).json({ error: 'No se pudo consultar el remito.' });
  }
});

module.exports = router;
