import { createContext, useCallback, useContext, useState } from 'react';
import { api, configurarSesion } from './api';

// Sesión del usuario: token y datos del perfil, guardados en el navegador para no perderlos al recargar.
const CLAVE = 'sesion-suma-voluntades';
const ContextoSesion = createContext(null);

function leerGuardada() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE)) || null;
  } catch {
    return null;
  }
}

export function ProveedorSesion({ children }) {
  const [sesion, setSesion] = useState(() => {
    const guardada = leerGuardada();
    configurarSesion(guardada && guardada.token);
    return guardada;
  });

  const cerrarSesion = useCallback(() => {
    try { localStorage.removeItem(CLAVE); } catch { /* sin almacenamiento */ }
    configurarSesion(null);
    setSesion(null);
  }, []);

  // Si la API responde 401 (token vencido), se cierra la sesión
  configurarSesion(sesion && sesion.token, cerrarSesion);

  const iniciarSesion = useCallback(async (email, password) => {
    const { token, usuario } = await api('/login', { metodo: 'POST', datos: { email, password } });
    const nueva = { token, usuario };
    try { localStorage.setItem(CLAVE, JSON.stringify(nueva)); } catch { /* sin almacenamiento */ }
    configurarSesion(token, cerrarSesion);
    setSesion(nueva);
  }, [cerrarSesion]);

  return (
    <ContextoSesion.Provider value={{ usuario: sesion && sesion.usuario, iniciarSesion, cerrarSesion }}>
      {children}
    </ContextoSesion.Provider>
  );
}

export function useSesion() {
  return useContext(ContextoSesion);
}
