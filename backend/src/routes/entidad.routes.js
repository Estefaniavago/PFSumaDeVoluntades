const express = require('express');
const router = express.Router();
const entidadController = require('../controllers/entidad.controller');

//  endpoints
router.get('/', entidadController.obtenerRegistros);
router.post('/', entidadController.crearRegistro);

module.exports = router;