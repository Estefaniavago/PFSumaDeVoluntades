const express = require('express');
const router = express.Router();
const menuController = require('../controllers/menu.controller');

router.get('/', menuController.obtenerMenus);
router.get('/:id', menuController.obtenerDetalleMenu);
router.post('/', menuController.crearMenu);

module.exports = router;