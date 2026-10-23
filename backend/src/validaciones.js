function hoyArgentina() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
}

// Devuelve una lista de errores en lenguaje claro (RNF-03). Lista vacía = datos válidos.
function validarIngreso(body) {
  const errores = [];
  const items = body && body.items;

  if (!Array.isArray(items) || items.length === 0) {
    return ['Cargá al menos un producto.'];
  }

  items.forEach((it, i) => {
    const n = `Ítem ${i + 1}`;
    const cantidad = Number(it.cantidad);

    if (!Number.isInteger(it.id_producto)) {
      errores.push(`${n}: elegí un producto.`);
    }
    if (!(cantidad > 0)) {
      errores.push(`${n}: la cantidad debe ser mayor que cero.`);
    } else if (cantidad > 100000) {
      errores.push(`${n}: la cantidad parece demasiado grande, revisala.`);
    }
    if (it.fecha_vencimiento) {
      const valida = /^\d{4}-\d{2}-\d{2}$/.test(it.fecha_vencimiento) &&
                     !isNaN(new Date(it.fecha_vencimiento));
      if (!valida) {
        errores.push(`${n}: la fecha de vencimiento no es válida.`);
      } else if (it.fecha_vencimiento < hoyArgentina()) {
        errores.push(`${n}: ese producto ya está vencido.`);
      }
    }
  });

  return errores;
}

module.exports = { validarIngreso };