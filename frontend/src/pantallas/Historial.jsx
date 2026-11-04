import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { num, fecha, fechaHora, TIPOS_ACTIVIDAD } from '../formato';

// Historial de movimientos del inventario (RF-08, RF-13): quién hizo qué, cuándo y por qué.
// Los filtros quedan en la dirección (por ejemplo ?lote=12), así se puede llegar desde un lote.

const TIPOS = {
  ingreso: { nombre: 'Ingreso', clase: 'ok' },
  salida: { nombre: 'Salida', clase: '' },
  derivacion: { nombre: 'Derivación', clase: 'baja' },
  baja: { nombre: 'Baja', clase: 'falta' },
  ajuste: { nombre: 'Ajuste', clase: '' },
};
const LIMITE = 100;

function detalle(m) {
  const partes = [];
  if (m.tipo_movimiento === 'ingreso') partes.push(`Remito ${m.nro_remito}`);
  if (m.id_actividad) partes.push(`Para ${TIPOS_ACTIVIDAD[m.tipo_actividad].toLowerCase()} del ${fecha(m.fecha_hora_salida)}`);
  if (m.destino_nombre) partes.push(`A ${m.destino_nombre}`);
  if (m.motivo && !/^(Salida para la actividad|Salida de mercadería para actividad)/.test(m.motivo)) partes.push(m.motivo);
  return partes.join(' · ');
}

export default function Historial() {
  const [parametros, setParametros] = useSearchParams();
  const [movimientos, setMovimientos] = useState(null);
  const [productos, setProductos] = useState([]);
  const [actividades, setActividades] = useState([]);
  const [error, setError] = useState('');

  const filtros = {
    lote: parametros.get('lote') || '',
    producto: parametros.get('producto') || '',
    tipo: parametros.get('tipo') || '',
    actividad: parametros.get('actividad') || '',
    desde: parametros.get('desde') || '',
    hasta: parametros.get('hasta') || '',
  };
  const consulta = parametros.toString();

  useEffect(() => {
    Promise.all([api('/productos'), api('/actividades')])
      .then(([p, a]) => { setProductos(p.filter(x => x.categoria !== 'dinero')); setActividades(a); })
      .catch(err => setError(err.message));
  }, []);

  useEffect(() => {
    const f = new URLSearchParams(consulta);
    const q = new URLSearchParams();
    const pasar = (de, a) => { if (f.get(de)) q.set(a, f.get(de)); };
    pasar('lote', 'id_donacion'); pasar('producto', 'id_producto'); pasar('tipo', 'tipo_movimiento');
    pasar('actividad', 'id_actividad'); pasar('desde', 'fecha_desde'); pasar('hasta', 'fecha_hasta');
    api('/movimientos' + (q.toString() ? '?' + q : ''))
      .then(lista => { setMovimientos(lista); setError(''); })
      .catch(err => setError(err.message));
  }, [consulta]);

  const cambiar = campo => e => {
    const nuevos = new URLSearchParams(parametros);
    if (e.target.value) nuevos.set(campo, e.target.value); else nuevos.delete(campo);
    setMovimientos(null);
    setParametros(nuevos, { replace: true });
  };
  const limpiar = () => { setMovimientos(null); setParametros({}, { replace: true }); };
  const hayFiltros = Object.values(filtros).some(Boolean);

  return (
    <div className="angosta">
      <Link to="/deposito" className="enlace" style={{ display: 'inline-block', marginBottom: 8 }}>← Depósito</Link>
      <h2>Movimientos</h2>
      <p className="ayuda">Todo lo que entró y salió del depósito, con quién lo registró y cuándo. No se edita ni se borra.</p>

      <div className="tarjeta filtros">
        {filtros.lote && (
          <p className="mini" style={{ marginBottom: 6 }}>
            Mostrando un solo lote (n.º {filtros.lote}).
          </p>
        )}
        <div className="dos">
          <div>
            <label htmlFor="f-producto" style={{ marginTop: 0 }}>Producto</label>
            <select id="f-producto" value={filtros.producto} onChange={cambiar('producto')}>
              <option value="">Todos</option>
              {productos.map(p => <option key={p.id_producto} value={p.id_producto}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-tipo" style={{ marginTop: 0 }}>Tipo</label>
            <select id="f-tipo" value={filtros.tipo} onChange={cambiar('tipo')}>
              <option value="">Todos</option>
              {Object.entries(TIPOS).map(([v, t]) => <option key={v} value={v}>{t.nombre}</option>)}
            </select>
          </div>
        </div>
        <label htmlFor="f-actividad">Actividad</label>
        <select id="f-actividad" value={filtros.actividad} onChange={cambiar('actividad')}>
          <option value="">Todas</option>
          {actividades.map(a => (
            <option key={a.id_actividad} value={a.id_actividad}>{TIPOS_ACTIVIDAD[a.tipo_actividad]} del {fecha(a.fecha_hora_salida)}</option>
          ))}
        </select>
        <div className="dos">
          <div>
            <label htmlFor="f-desde">Desde</label>
            <input id="f-desde" type="date" value={filtros.desde} onChange={cambiar('desde')} />
          </div>
          <div>
            <label htmlFor="f-hasta">Hasta</label>
            <input id="f-hasta" type="date" value={filtros.hasta} min={filtros.desde || undefined} onChange={cambiar('hasta')} />
          </div>
        </div>
        {hayFiltros && <button type="button" className="enlace" style={{ marginTop: 10 }} onClick={limpiar}>Quitar los filtros</button>}
      </div>

      {error && <div className="mensaje-error">{error}</div>}
      {!error && !movimientos && <p className="cargando">Cargando movimientos…</p>}
      {movimientos && !movimientos.length && <p className="mini">No hay movimientos con estos filtros.</p>}

      {movimientos && movimientos.map(m => {
        const tipo = TIPOS[m.tipo_movimiento];
        const cantidad = Number(m.cantidad);
        return (
          <div className="movimiento" key={m.id_movimiento}>
            <div className="fila">
              <div>
                <span className={'etiqueta ' + tipo.clase}>{tipo.nombre}</span>{' '}
                <strong>{m.producto}</strong>
              </div>
              <strong className={cantidad < 0 ? 'resta' : 'suma'}>
                {cantidad < 0 ? '−' : '+'}{num(Math.abs(cantidad))} {m.unidad_medida}
              </strong>
            </div>
            <p className="mini">{fechaHora(m.fecha_hora)} · {m.usuario}</p>
            {detalle(m) && <p className="mini">{detalle(m)}</p>}
          </div>
        );
      })}
      {movimientos && movimientos.length === LIMITE && (
        <p className="mini" style={{ marginTop: 10 }}>Se muestran los últimos {LIMITE}. Usá los filtros para ver movimientos anteriores.</p>
      )}
    </div>
  );
}
