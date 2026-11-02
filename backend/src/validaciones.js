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

// Convierte un valor recibido en un número y lo valida (RF-11).
// Devuelve { valor } si es válido o { error } con un mensaje claro.
// Acepta números y textos numéricos ("2.5"); rechaza "diez", vacío, NaN e Infinity.
function leerNumero(entrada, campo, { permitirNegativo = false, permitirCero = false, entero = false, maximo = 100000 } = {}) {
  const valor = typeof entrada === 'string' && entrada.trim() !== '' ? Number(entrada) : entrada;

  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    return { error: `${campo}: tiene que ser un número.` };
  }
  if (entero && !Number.isInteger(valor)) {
    return { error: `${campo}: tiene que ser un número entero.` };
  }
  if (valor === 0 && !permitirCero) {
    return { error: `${campo}: no puede ser cero.` };
  }
  if (valor < 0 && !permitirNegativo) {
    return { error: `${campo}: tiene que ser mayor que cero.` };
  }
  if (Math.abs(valor) > maximo) {
    return { error: `${campo}: el valor parece demasiado grande, revisalo.` };
  }
  return { valor };
}

// Valida un identificador (id_donacion, id_actividad, etc.): entero positivo.
function leerId(entrada, campo) {
  return leerNumero(entrada, campo, { entero: true, maximo: Number.MAX_SAFE_INTEGER });
}

module.exports = { validarIngreso, leerNumero, leerId };