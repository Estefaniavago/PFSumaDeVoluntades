import { useEffect, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useSesion } from '../sesion';
import { puede } from '../permisos';
import { num, fechaHora, diasHasta, TIPOS_ACTIVIDAD } from '../formato';

const ESTADOS = { planificada: 'Planificada', realizada: 'Salió', cancelada: 'Cancelada' };
const CLASE_ESTADO = { planificada: 'ok', realizada: '', cancelada: 'falta' };

export default function Actividades() {
  return (
    <Routes>
      <Route index element={<Lista />} />
      <Route path=":id" element={<Detalle />} />
    </Routes>
  );
}

/* ───────── Listado y alta ───────── */

function Lista() {
  const { usuario } = useSesion();
  const [actividades, setActividades] = useState(null);
  const [error, setError] = useState('');
  const [creando, setCreando] = useState(false);
  const organiza = puede.organizarActividades(usuario.rol);

  const cargar = () => api('/actividades').then(setActividades).catch(err => setError(err.message));
  useEffect(() => { cargar(); }, []);

  if (error) return <><h2>Actividades</h2><div className="mensaje-error">{error}</div></>;
  if (!actividades) return <><h2>Actividades</h2><p className="cargando">Cargando actividades…</p></>;

  const proximas = actividades
    .filter(a => a.estado === 'planificada')
    .sort((x, y) => new Date(x.fecha_hora_salida) - new Date(y.fecha_hora_salida));
  const anteriores = actividades.filter(a => a.estado !== 'planificada');

  return (
    <div className="angosta">
      <h2>Actividades</h2>
      <p className="ayuda">Tocá una actividad para ver qué hace falta y si alcanza lo que hay en el depósito.</p>

      {organiza && !creando && (
        <button className="boton secundario" style={{ marginTop: 0, marginBottom: 12 }} onClick={() => setCreando(true)}>
          + Nueva actividad
        </button>
      )}
      {creando && <FormActividad alCerrar={() => setCreando(false)} alGuardar={() => { setCreando(false); cargar(); }} />}

      <h3 className="subtitulo">Próximas</h3>
      {!proximas.length && <p className="mini">No hay actividades planificadas.</p>}
      {proximas.map(a => <TarjetaActividad key={a.id_actividad} a={a} />)}

      {anteriores.length > 0 && <>
        <h3 className="subtitulo">Anteriores</h3>
        {anteriores.map(a => <TarjetaActividad key={a.id_actividad} a={a} />)}
      </>}
    </div>
  );
}

function TarjetaActividad({ a }) {
  const dias = diasHasta(a.fecha_hora_salida);
  const atrasada = a.estado === 'planificada' && dias < 0;
  return (
    <Link to={`/actividades/${a.id_actividad}`} className="tarjeta alerta" style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
      <h3>{TIPOS_ACTIVIDAD[a.tipo_actividad]}: {fechaHora(a.fecha_hora_salida)}</h3>
      <p className="mini">{a.porciones_estimadas} porciones · {a.nombre_menu || 'sin menú asignado'}</p>
      <p style={{ marginTop: 8 }}>
        <span className={'etiqueta ' + (atrasada ? 'baja' : CLASE_ESTADO[a.estado])}>
          {atrasada ? 'Fecha pasada, sin salida registrada' : ESTADOS[a.estado]}
        </span>
      </p>
    </Link>
  );
}

// "2026-11-06T20:00", el formato que usa el campo datetime-local, en hora local
const aCampoFecha = f => {
  const d = new Date(f);
  const dos = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}`;
};

// Alta de una actividad o edición de una existente (si llega "actividad")
function FormActividad({ actividad, alCerrar, alGuardar }) {
  const [menus, setMenus] = useState([]);
  const [datos, setDatos] = useState(actividad
    ? { tipo_actividad: actividad.tipo_actividad, fecha_hora_salida: aCampoFecha(actividad.fecha_hora_salida),
        porciones_estimadas: String(actividad.porciones_estimadas), id_menu: actividad.id_menu ? String(actividad.id_menu) : '' }
    : { tipo_actividad: 'cena', fecha_hora_salida: '', porciones_estimadas: '', id_menu: '' });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const cambiar = campo => e => setDatos({ ...datos, [campo]: e.target.value });

  useEffect(() => { api('/menus').then(setMenus).catch(err => setError(err.message)); }, []);

  async function guardar(e) {
    e.preventDefault();
    setError('');
    if (!datos.fecha_hora_salida) return setError('Indicá el día y la hora de salida.');
    if (new Date(datos.fecha_hora_salida) < new Date()) return setError('La fecha de salida ya pasó.');
    const porciones = Number(datos.porciones_estimadas);
    if (!Number.isInteger(porciones) || porciones <= 0) return setError('Las porciones tienen que ser un número entero mayor que cero.');

    setEnviando(true);
    try {
      await api(actividad ? `/actividades/${actividad.id_actividad}` : '/actividades', {
        metodo: actividad ? 'PUT' : 'POST',
        datos: {
          tipo_actividad: datos.tipo_actividad,
          // datetime-local da la hora local; se manda con zona horaria para que no se corra
          fecha_hora_salida: new Date(datos.fecha_hora_salida).toISOString(),
          porciones_estimadas: porciones,
          id_menu: datos.id_menu || null,
        },
      });
      alGuardar();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="tarjeta" onSubmit={guardar} noValidate>
      <h3>{actividad ? 'Editar actividad' : 'Nueva actividad'}</h3>
      <label htmlFor="tipo">Tipo</label>
      <select id="tipo" value={datos.tipo_actividad} onChange={cambiar('tipo_actividad')}>
        {Object.entries(TIPOS_ACTIVIDAD).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
      <label htmlFor="fecha">Día y hora de salida</label>
      <input id="fecha" type="datetime-local" value={datos.fecha_hora_salida} onChange={cambiar('fecha_hora_salida')} />
      <label htmlFor="porciones">Porciones estimadas</label>
      <input id="porciones" type="number" min="1" step="1" inputMode="numeric" value={datos.porciones_estimadas} onChange={cambiar('porciones_estimadas')} />
      <label htmlFor="menu">Menú</label>
      <select id="menu" value={datos.id_menu} onChange={cambiar('id_menu')}>
        <option value="">Sin menú (por ejemplo, el roperito)</option>
        {menus.map(m => <option key={m.id_menu} value={m.id_menu}>{m.nombre_menu}</option>)}
      </select>
      {error && <div className="mensaje-error">{error}</div>}
      <button className="boton" disabled={enviando}>{enviando ? 'Guardando…' : actividad ? 'Guardar cambios' : 'Guardar actividad'}</button>
      <button type="button" className="boton secundario" onClick={alCerrar}>Cancelar</button>
    </form>
  );
}

/* ───────── Detalle: lo que hace falta y la salida ───────── */

function Detalle() {
  const { id } = useParams();
  const navegar = useNavigate();
  const { usuario } = useSesion();
  const [actividad, setActividad] = useState(null);
  const [menu, setMenu] = useState(null);
  const [presupuesto, setPresupuesto] = useState(null);
  const [error, setError] = useState('');
  const [errorAccion, setErrorAccion] = useState('');
  const [salida, setSalida] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    Promise.all([api('/actividades'), api('/menus')])
      .then(async ([lista, menus]) => {
        const a = lista.find(x => String(x.id_actividad) === id);
        if (!a) throw new Error('No se encontró la actividad.');
        setActividad(a);
        setMenu(menus.find(m => m.id_menu === a.id_menu) || null);
        if (a.id_menu && a.estado === 'planificada') setPresupuesto(await api(`/actividades/${id}/presupuesto`));
      })
      .catch(err => setError(err.message));
  }, [id, vuelta]);

  if (error) return <><Volver /><div className="mensaje-error">{error}</div></>;
  if (!actividad) return <p className="cargando">Cargando la actividad…</p>;

  const titulo = `${TIPOS_ACTIVIDAD[actividad.tipo_actividad]}: ${fechaHora(actividad.fecha_hora_salida)}`;

  async function registrarSalida() {
    const faltan = presupuesto.insumos.filter(i => i.faltante > 0);
    const aviso = faltan.length
      ? `No alcanza todo: ${faltan.map(i => `${i.nombre.toLowerCase()} (faltan ${num(i.faltante)} ${i.unidad_medida})`).join(', ')}.\nSe registra la salida de lo que hay. ¿Seguimos?`
      : '¿Registrar la salida de toda la mercadería de esta actividad?';
    if (!window.confirm(aviso)) return;

    setErrorAccion('');
    setEnviando(true);
    try {
      const r = await api(`/actividades/${id}/salida`, { metodo: 'POST' });
      setSalida(r.insumos);
      setActividad({ ...actividad, estado: 'realizada' });
    } catch (err) {
      setErrorAccion(err.message);
    } finally {
      setEnviando(false);
    }
  }

  async function cancelar() {
    if (!window.confirm('¿Cancelar esta actividad? No se puede deshacer.')) return;
    setErrorAccion('');
    try {
      await api(`/actividades/${id}/cancelar`, { metodo: 'PUT' });
      navegar('/actividades');
    } catch (err) {
      setErrorAccion(err.message);
    }
  }

  if (salida) {
    return (
      <div className="angosta">
        <h2>Salida registrada</h2>
        <div className="mensaje-ok" role="status">
          <b>{titulo}</b>
          <ul>
            {salida.map(i => (
              <li key={i.id_producto}>
                {i.nombre}: {num(i.cantidad_retirada)} {i.unidad_medida}
                {i.faltante > 0 && ` (faltaron ${num(i.faltante)})`}
              </li>
            ))}
          </ul>
        </div>
        <p className="mini" style={{ marginTop: 10 }}>
          Quedó registrado que la hiciste vos, {usuario.nombre.split(' ')[0]}, con la fecha y la hora.
        </p>
        <Link to="/actividades" className="boton secundario" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
          Volver a las actividades
        </Link>
      </div>
    );
  }

  const planificada = actividad.estado === 'planificada';

  if (editando) {
    return (
      <div className="angosta">
        <FormActividad actividad={actividad} alCerrar={() => setEditando(false)}
                       alGuardar={() => { setEditando(false); setPresupuesto(null); setVuelta(v => v + 1); }} />
      </div>
    );
  }
  const faltantes = presupuesto ? presupuesto.insumos.filter(i => i.faltante > 0).length : 0;

  return (
    <div className="angosta">
      <Volver />
      <h2>{titulo}</h2>
      <p className="ayuda">{actividad.porciones_estimadas} porciones · {actividad.nombre_menu || 'sin menú asignado'} · {ESTADOS[actividad.estado]}</p>

      {!actividad.id_menu && <div className="aviso-caja">Esta actividad no tiene menú, así que no se calculan insumos.</div>}
      {!planificada && actividad.id_menu && (
        <div className="aviso-caja">
          {actividad.estado === 'realizada' ? 'La salida de esta actividad ya se registró.' : 'Esta actividad se canceló.'}
        </div>
      )}

      {planificada && menu && (
        <div className="aviso-caja">
          Lo que hace falta se calcula con el rendimiento cargado para {menu.nombre_menu}:{' '}
          {menu.insumos.map(i => `${num(i.cantidad_por_porcion * 100)} ${i.unidad_medida} de ${i.nombre_producto.toLowerCase()}`).join(', ')} cada 100 porciones.
        </div>
      )}

      {planificada && actividad.id_menu && !presupuesto && <p className="cargando">Calculando lo que hace falta…</p>}

      {presupuesto && planificada && <>
        <p className="mini" style={{ marginBottom: 8 }}>
          {faltantes ? `Falta${faltantes > 1 ? 'n' : ''} ${faltantes} de ${presupuesto.insumos.length} insumos.` : 'Alcanza todo lo que hay en el depósito.'}
          {' '}Solo se cuentan los lotes disponibles y sin vencer.
        </p>
        <table>
          <thead><tr><th>Insumo</th><th className="num">Hace falta</th></tr></thead>
          <tbody>
            {presupuesto.insumos.map(i => (
              <tr key={i.id_producto} className={i.faltante > 0 ? 'falta' : ''}>
                <td>
                  <strong>{i.nombre}</strong><br />
                  {i.faltante > 0
                    ? <span className="etiqueta falta">Faltan {num(i.faltante)} {i.unidad_medida}</span>
                    : <span className="etiqueta ok">Alcanza</span>}
                </td>
                <td className="num">
                  {num(i.cantidad_necesaria)} {i.unidad_medida}<br />
                  <span className="mini">hay {num(i.stock_disponible)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </>}

      {errorAccion && <div className="mensaje-error">{errorAccion}</div>}

      {planificada && presupuesto && puede.registrarSalida(usuario.rol) && (
        <button className="boton" onClick={registrarSalida} disabled={enviando}>
          {enviando ? 'Registrando…' : 'Registrar salida de la mercadería'}
        </button>
      )}
      {planificada && puede.organizarActividades(usuario.rol) && <>
        <button className="boton secundario" onClick={() => setEditando(true)}>Editar porciones, fecha o menú</button>
        <button className="boton peligro" onClick={cancelar}>Cancelar actividad</button>
      </>}
      {planificada && !puede.registrarSalida(usuario.rol) && presupuesto && (
        <p className="mini" style={{ marginTop: 12 }}>
          La salida de la mercadería la registra el encargado de depósito cuando se retira.
        </p>
      )}
    </div>
  );
}

function Volver() {
  return <Link to="/actividades" className="enlace" style={{ display: 'inline-block', marginBottom: 8 }}>← Actividades</Link>;
}
