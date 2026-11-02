// Números y fechas como se escriben en Argentina
export const num = n => Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 });

// Una fecha sin hora ("2026-11-05", como devuelve la API) se toma como día local, sin corrimiento de huso
function aFecha(f) {
  if (typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f)) {
    const [a, m, d] = f.split('-').map(Number);
    return new Date(a, m - 1, d);
  }
  return new Date(f);
}

// "05/11"
export const fecha = f => aFecha(f).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });

const mayuscula = t => t.charAt(0).toUpperCase() + t.slice(1);

// "viernes 6 de noviembre, 20:00"
export const fechaHora = f => {
  const d = new Date(f);
  const dia = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');
  const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${dia}, ${hora}`;
};

// "Lunes 2 de noviembre"
export const hoyLargo = () => mayuscula(
  new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', ''));

// Días que faltan para una fecha (0 = hoy)
export function diasHasta(f) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const destino = aFecha(f); destino.setHours(0, 0, 0, 0);
  return Math.round((destino - hoy) / 86400000);
}

export const TIPOS_ACTIVIDAD = {
  desayuno: 'Desayuno', merienda: 'Merienda', cena: 'Cena',
  salida_barrios: 'Salida a los barrios', ropero: 'Roperito', evento: 'Evento',
};
