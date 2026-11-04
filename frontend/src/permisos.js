// Qué puede hacer cada perfil, según la tabla de permisos por rol del documento.
// Es solo para la interfaz: el control real lo hace el servidor (RNF-05).

export const NOMBRES_PERFIL = {
  referente_puerta: 'Referente de puerta',
  encargado_deposito: 'Encargado de depósito',
  coordinador_actividad: 'Coordinador de actividad',
  direccion: 'Dirección',
};

const PANTALLAS = {
  ingreso: ['referente_puerta', 'encargado_deposito', 'direccion'],
  deposito: ['encargado_deposito', 'coordinador_actividad', 'direccion'],
  actividades: ['encargado_deposito', 'coordinador_actividad', 'direccion'],
  gestion: ['encargado_deposito', 'coordinador_actividad', 'direccion'],
};

// Quién tiene acceso, para explicarlo cuando una pantalla no está disponible
export const MOTIVOS = {
  ingreso: 'Los ingresos los cargan los referentes de puerta, el encargado de depósito y la dirección.',
  deposito: 'El stock lo consultan el encargado de depósito, los coordinadores de actividad y la dirección.',
  actividades: 'Las actividades las consultan el encargado de depósito, los coordinadores de actividad y la dirección.',
  gestion: 'La gestión la usan el encargado de depósito, los coordinadores de actividad y la dirección.',
};

export function puedeVer(rol, pantalla) {
  return Boolean(PANTALLAS[pantalla] && PANTALLAS[pantalla].includes(rol));
}

// Acciones puntuales dentro de las pantallas
export const puede = {
  verStock: rol => ['encargado_deposito', 'coordinador_actividad', 'direccion'].includes(rol),
  verAlertas: rol => ['encargado_deposito', 'coordinador_actividad', 'direccion'].includes(rol),
  crearProducto: rol => ['referente_puerta', 'encargado_deposito', 'direccion'].includes(rol),
  editarProductos: rol => ['encargado_deposito', 'direccion'].includes(rol),
  registrarSalida: rol => ['encargado_deposito', 'direccion'].includes(rol),
  // Ajustes, bajas y derivaciones de un lote (RF-06, RF-07, RF-12)
  corregirStock: rol => ['encargado_deposito', 'direccion'].includes(rol),
  organizarActividades: rol => ['coordinador_actividad', 'direccion'].includes(rol),
  editarMenus: rol => rol === 'direccion',
  gestionarUsuarios: rol => rol === 'direccion',
};
