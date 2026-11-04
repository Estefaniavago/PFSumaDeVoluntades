import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useSesion } from '../sesion';
import { puede, puedeVer } from '../permisos';
import { num, fecha, fechaHora, hoyLargo, diasHasta, TIPOS_ACTIVIDAD } from '../formato';

const ACCESOS = [
  { ruta: '/ingreso', pantalla: 'ingreso', titulo: 'Ingresar donación', detalle: 'Cargar lo que llegó' },
  { ruta: '/deposito', pantalla: 'deposito', titulo: 'Ver depósito', detalle: 'Qué hay disponible' },
  { ruta: '/actividades', pantalla: 'actividades', titulo: 'Actividades', detalle: 'Lo que hace falta para cada salida' },
  { ruta: '/gestion', pantalla: 'gestion', titulo: 'Gestión', detalle: 'Productos, menús y más' },
];

export default function Inicio() {
  const { usuario } = useSesion();
  const verAlertas = puede.verAlertas(usuario.rol);
  const [alertas, setAlertas] = useState(null);
  const [actividades, setActividades] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!verAlertas) return;
    Promise.all([api('/alertas'), api('/actividades')])
      .then(([a, act]) => {
        setAlertas(a);
        // Próximas actividades planificadas, de la más cercana a la más lejana
        setActividades(act
          .filter(x => x.estado === 'planificada' && diasHasta(x.fecha_hora_salida) >= 0)
          .sort((x, y) => new Date(x.fecha_hora_salida) - new Date(y.fecha_hora_salida))
          .slice(0, 3));
      })
      .catch(err => setError(err.message));
  }, [verAlertas]);

  const accesos = ACCESOS.filter(a => puedeVer(usuario.rol, a.pantalla));

  return (
    <div className="inicio">
      <div className="encabezado-pantalla">
        <h2>Hola, {usuario.nombre.split(' ')[0]}</h2>
        <p className="ayuda">{hoyLargo()}</p>
      </div>

      <div>
        {!verAlertas && (
          <div className="tarjeta">
            <h3>Cargá las donaciones apenas llegan</h3>
            <p className="mini">Producto, cantidad y vencimiento. Si el donante quiere quedar anónimo, se registra igual.</p>
          </div>
        )}

        {error && <div className="mensaje-error">{error}</div>}
        {verAlertas && !alertas && !error && <p className="cargando">Cargando alertas…</p>}

        {alertas && alertas.stock_bajo_minimo.map(p => (
          <div className="tarjeta alerta critica" key={'min' + p.id_producto}>
            <h3>{p.nombre}: por debajo del mínimo</h3>
            <p className="mini">Hay {num(p.stock_actual)} {p.unidad_medida} y el mínimo es {num(p.minimo_deseable)}.</p>
            <p style={{ marginTop: 8 }}>
              <span className="etiqueta falta">Faltan {num(p.minimo_deseable - p.stock_actual)} {p.unidad_medida}</span>
            </p>
          </div>
        ))}

        {alertas && alertas.proximos_a_vencer.map(l => (
          <div className="tarjeta alerta aviso" key={'ven' + l.id_donacion}>
            <h3>{l.producto}: vence el {fecha(l.fecha_vencimiento)}</h3>
            <p className="mini">Quedan {num(l.stock_actual_lote)} en el lote {l.id_donacion}. Conviene usarlo o derivarlo a tiempo.</p>
            <p style={{ marginTop: 8 }}>
              <span className="etiqueta baja">
                {diasHasta(l.fecha_vencimiento) === 0 ? 'Vence hoy' : `Faltan ${diasHasta(l.fecha_vencimiento)} días`}
              </span>
            </p>
          </div>
        ))}

        {alertas && !alertas.stock_bajo_minimo.length && !alertas.proximos_a_vencer.length && (
          <div className="tarjeta alerta">
            <h3>Sin alertas</h3>
            <p className="mini">Ningún producto está bajo el mínimo ni vence en los próximos 7 días.</p>
          </div>
        )}

        {actividades.map(a => (
          <Link to={`/actividades/${a.id_actividad}`} className="tarjeta alerta" key={a.id_actividad}
                style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
            <h3>{TIPOS_ACTIVIDAD[a.tipo_actividad]}: {fechaHora(a.fecha_hora_salida)}</h3>
            <p className="mini">{a.porciones_estimadas} porciones · {a.nombre_menu || 'sin menú asignado'}</p>
          </Link>
        ))}
      </div>

      <div className="accesos">
        {accesos.map(a => (
          <Link key={a.ruta} to={a.ruta} className="acceso">{a.titulo}<span>{a.detalle}</span></Link>
        ))}
      </div>
    </div>
  );
}
