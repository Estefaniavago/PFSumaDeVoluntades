// Comunicación con la API REST del backend.
// La dirección se configura con VITE_API_URL (ver .env.example); por defecto, el backend local.
const URL_API = import.meta.env.VITE_API_URL || 'http://localhost:3000';

let token = null;
let alVencerSesion = () => {};

export function configurarSesion(nuevoToken, callbackVencida) {
  token = nuevoToken;
  if (callbackVencida) alVencerSesion = callbackVencida;
}

// Error con el mensaje que devuelve la API ({ error: '...' }) y el código HTTP
export class ErrorApi extends Error {
  constructor(mensaje, estado) {
    super(mensaje);
    this.estado = estado;
  }
}

export async function api(ruta, { metodo = 'GET', datos } = {}) {
  let respuesta;
  try {
    respuesta = await fetch(URL_API + ruta, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: datos !== undefined ? JSON.stringify(datos) : undefined,
    });
  } catch {
    throw new ErrorApi('No se pudo conectar con el servidor. Revisá tu conexión e intentá de nuevo.', 0);
  }

  let cuerpo = null;
  try {
    cuerpo = await respuesta.json();
  } catch {
    // Respuesta sin cuerpo JSON
  }

  if (!respuesta.ok) {
    // Sesión vencida o inválida: se vuelve al inicio de sesión (salvo en el propio login)
    if (respuesta.status === 401 && ruta !== '/login') alVencerSesion();
    throw new ErrorApi((cuerpo && cuerpo.error) || 'Ocurrió un error inesperado. Intentá de nuevo.', respuesta.status);
  }
  return cuerpo;
}
