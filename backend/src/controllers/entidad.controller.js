const entidadService = require('../services/entidad.service');

const obtenerRegistros = async (req, res) => {
    try {
        const resultados = await entidadService.getAll();
        return res.status(200).json({ success: true, data: resultados });
    } catch (error) {
        console.error('Error al obtener registros:', error);
        return res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

const crearRegistro = async (req, res) => {
    try {
        const nuevoDato = req.body;
        const resultadoCreacion = await entidadService.create(nuevoDato);
        return res.status(201).json({ success: true, data: resultadoCreacion });
    } catch (error) {
        console.error('Error al crear registro:', error);
        return res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

module.exports = {
    obtenerRegistros,
    crearRegistro
};