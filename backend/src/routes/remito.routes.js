const express = require('express');
const router = express.Router();
const remitoController = require('../controllers/remito.controller');

router.get('/', remitoController.obtenerRemitos);
router.post('/', remitoController.registrarRemito);

module.exports = router;