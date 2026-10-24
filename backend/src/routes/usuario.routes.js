const express = require('express');
const router = express.Router();
const usuarioController = require('../controllers/usuario.controller');

// Listar todos
router.get('/', usuarioController.obtenerUsuarios);

// Registrar uno nuevo
router.post('/', usuarioController.crearUsuario);

module.exports = router;