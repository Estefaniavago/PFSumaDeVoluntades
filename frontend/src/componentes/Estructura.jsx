import { NavLink, Outlet } from 'react-router-dom';
import { useSesion } from '../sesion';
import { NOMBRES_PERFIL, MOTIVOS, puede, puedeVer } from '../permisos';
import Avisos from './Avisos';

const SECCIONES = [
  { ruta: '/', icono: '⌂', texto: 'Inicio' },
  { ruta: '/ingreso', icono: '＋', texto: 'Ingresar', pantalla: 'ingreso' },
  { ruta: '/deposito', icono: '▤', texto: 'Depósito', pantalla: 'deposito' },
  { ruta: '/actividades', icono: '◷', texto: 'Actividades', pantalla: 'actividades' },
  { ruta: '/gestion', icono: '⚙', texto: 'Gestión', pantalla: 'gestion' },
];

// Encabezado, contenido de la pantalla y barra de navegación
export function Estructura() {
  const { usuario, cerrarSesion } = useSesion();
  const secciones = SECCIONES.filter(s => !s.pantalla || puedeVer(usuario.rol, s.pantalla));

  return (
    <div className="app">
      <header className="encabezado">
        <div className="fila">
          <div className="identidad">
            <img src="/logo.png" alt="Suma de Voluntades" />
            <div className="nombre-app">Gestión de<br />donaciones</div>
          </div>
          <div className="acciones-header">
            {puede.verAlertas(usuario.rol) && <Avisos />}
            <div className="usuario">
              <b>{usuario.nombre}</b>
              {NOMBRES_PERFIL[usuario.rol]}
            </div>
            <button className="salir" onClick={cerrarSesion}>Salir</button>
          </div>
        </div>
      </header>

      <main>
        <Outlet />
      </main>

      <nav className="navegacion">
        {secciones.map(s => (
          <NavLink key={s.ruta} to={s.ruta} end={s.ruta === '/'}>
            <i aria-hidden="true">{s.icono}</i>{s.texto}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

// Protege una pantalla: si el perfil no tiene acceso, muestra quién sí lo tiene
export function SoloPara({ pantalla, titulo, children }) {
  const { usuario } = useSesion();
  if (puedeVer(usuario.rol, pantalla)) return children;
  return (
    <>
      <h2>{titulo}</h2>
      <div className="bloqueado">
        <strong>Esta pantalla no está disponible para tu perfil</strong>
        {MOTIVOS[pantalla]}
      </div>
    </>
  );
}
