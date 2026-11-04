import { useEffect, useState } from 'react';
import { api } from '../api';
import { useSesion } from '../sesion';
import { puede, NOMBRES_PERFIL } from '../permisos';
import { num } from '../formato';
import { CATEGORIAS, NOMBRE_CATEGORIA, UNIDADES } from '../catalogo';

const SECCIONES = [
  { id: 'productos', nombre: 'Productos', permitido: puede.editarProductos },
  { id: 'menus', nombre: 'Menús', permitido: () => true },
  { id: 'destinos', nombre: 'Destinos', permitido: puede.editarProductos },
  { id: 'usuarios', nombre: 'Usuarios', permitido: puede.gestionarUsuarios },
];

const TIPOS_DESTINO = { comedor: 'Comedor', otra_org: 'Otra organización' };

export default function Gestion() {
  const { usuario } = useSesion();
  const secciones = SECCIONES.filter(s => s.permitido(usuario.rol));
  const [seccion, setSeccion] = useState(secciones[0].id);

  return (
    <div className="angosta">
      <h2>Gestión</h2>
      <p className="ayuda">Los datos que usa el resto del sistema.</p>
      {secciones.length > 1 && (
        <div className="segmentos" role="tablist">
          {secciones.map(s => (
            <button key={s.id} type="button" className={seccion === s.id ? 'activo' : ''} onClick={() => setSeccion(s.id)}>{s.nombre}</button>
          ))}
        </div>
      )}
      {seccion === 'productos' && <Productos />}
      {seccion === 'menus' && <Menus />}
      {seccion === 'destinos' && <Destinos />}
      {seccion === 'usuarios' && <Usuarios />}
    </div>
  );
}

// Carga una lista y la vuelve a pedir cuando se llama a recargar()
function useLista(ruta) {
  const [lista, setLista] = useState(null);
  const [error, setError] = useState('');
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    api(ruta).then(setLista).catch(err => setError(err.message));
  }, [ruta, vuelta]);
  return { lista, error, recargar: () => setVuelta(v => v + 1) };
}

// Envía un formulario y maneja el estado de "enviando" y el error
function useEnvio() {
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  async function enviar(accion) {
    setError('');
    setEnviando(true);
    try {
      await accion();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setEnviando(false);
    }
  }
  return { error, setError, enviando, enviar };
}

function Aviso({ texto, alCerrar }) {
  if (!texto) return null;
  return <div className="mensaje-ok" style={{ marginTop: 0, marginBottom: 12 }} onClick={alCerrar}>{texto}</div>;
}

/* ───────── Productos ───────── */

function Productos() {
  // /stock trae los productos activos con su stock, así se puede avisar antes de dar de baja uno con mercadería
  const { lista: stock, error, recargar } = useLista('/stock');
  const [editando, setEditando] = useState(null);
  const [aviso, setAviso] = useState('');

  if (error) return <div className="mensaje-error">{error}</div>;
  if (!stock) return <p className="cargando">Cargando productos…</p>;
  const lista = stock.filter(p => p.categoria !== 'dinero');

  const terminar = texto => { setEditando(null); setAviso(texto); recargar(); };

  return <>
    <Aviso texto={aviso} alCerrar={() => setAviso('')} />
    {editando
      ? <FormProducto producto={editando === 'nuevo' ? null : editando} alCerrar={() => setEditando(null)} alGuardar={terminar} />
      : <button className="boton secundario" style={{ marginTop: 0, marginBottom: 12 }} onClick={() => { setAviso(''); setEditando('nuevo'); }}>+ Nuevo producto</button>}

    <table>
      <thead><tr><th>Producto</th><th className="num">Mínimo</th></tr></thead>
      <tbody>
        {lista.map(p => (
          <tr key={p.id_producto} className="fila-producto" onClick={() => { setAviso(''); setEditando(p); }}>
            <td>
              <strong>{p.nombre}</strong><br />
              <span className="mini">{NOMBRE_CATEGORIA[p.categoria] || p.categoria} · {p.unidad_medida}{p.perecedero ? ' · vence' : ''}</span>
            </td>
            <td className="num">
              {Number(p.minimo_deseable) > 0
                ? `${num(p.minimo_deseable)} ${p.unidad_medida}`
                : <span className="etiqueta baja">A definir</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </>;
}

function FormProducto({ producto, alCerrar, alGuardar }) {
  const [datos, setDatos] = useState(producto
    ? { nombre: producto.nombre, categoria: producto.categoria, unidad_medida: producto.unidad_medida,
        minimo_deseable: String(Number(producto.minimo_deseable)), perecedero: producto.perecedero }
    : { nombre: '', categoria: 'alimento', unidad_medida: 'kg', minimo_deseable: '', perecedero: false });
  const { error, setError, enviando, enviar } = useEnvio();
  const cambiar = campo => e => setDatos({ ...datos, [campo]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  // Si el producto tiene una unidad que no está en la lista, se agrega para no perderla
  const unidades = UNIDADES.includes(datos.unidad_medida) ? UNIDADES : [datos.unidad_medida, ...UNIDADES];

  async function guardar(e) {
    e.preventDefault();
    const nombre = datos.nombre.trim();
    if (!nombre) return setError('Escribí el nombre del producto.');
    const minimo = datos.minimo_deseable === '' ? 0 : Number(datos.minimo_deseable);
    if (!(minimo >= 0)) return setError('El mínimo tiene que ser un número igual o mayor que cero.');

    const cuerpo = { ...datos, nombre: nombre.charAt(0).toUpperCase() + nombre.slice(1), minimo_deseable: minimo };
    const ok = await enviar(() => producto
      ? api(`/productos/${producto.id_producto}`, { metodo: 'PUT', datos: cuerpo })
      : api('/productos', { metodo: 'POST', datos: cuerpo }));
    if (ok) alGuardar(producto ? `Se guardaron los cambios de ${cuerpo.nombre}.` : `${cuerpo.nombre} se agregó al catálogo.`);
  }

  async function darDeBaja() {
    const stock = Number(producto.stock_total);
    const pregunta = stock > 0
      ? `Todavía hay ${num(stock)} ${producto.unidad_medida} de ${producto.nombre} en el depósito. Si lo das de baja, deja de aparecer en el catálogo y en el depósito. ¿Seguro?`
      : `¿Dar de baja ${producto.nombre}? Deja de aparecer en el catálogo, pero su historial se conserva.`;
    if (!window.confirm(pregunta)) return;
    const ok = await enviar(() => api(`/productos/${producto.id_producto}`, { metodo: 'DELETE' }));
    if (ok) alGuardar(`${producto.nombre} se dio de baja.`);
  }

  return (
    <form className="tarjeta" onSubmit={guardar} noValidate>
      <h3>{producto ? `Editar ${producto.nombre}` : 'Nuevo producto'}</h3>
      <label htmlFor="p-nombre">Nombre</label>
      <input id="p-nombre" value={datos.nombre} onChange={cambiar('nombre')} maxLength={100} />
      <div className="dos">
        <div>
          <label htmlFor="p-categoria">Categoría</label>
          <select id="p-categoria" value={datos.categoria} onChange={cambiar('categoria')}>
            {CATEGORIAS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="p-unidad">Unidad</label>
          <select id="p-unidad" value={datos.unidad_medida} onChange={cambiar('unidad_medida')}>
            {unidades.map(u => <option key={u}>{u}</option>)}
          </select>
        </div>
      </div>
      <label htmlFor="p-minimo">Mínimo deseable en el depósito</label>
      <input id="p-minimo" type="number" min="0" step="any" inputMode="decimal" value={datos.minimo_deseable} onChange={cambiar('minimo_deseable')} placeholder="0 = sin mínimo" />
      <p className="mini">Si el stock baja de este número, aparece la alerta en el inicio.</p>
      <div className="check" style={{ marginTop: 12 }}>
        <input id="p-perecedero" type="checkbox" checked={datos.perecedero} onChange={cambiar('perecedero')} />
        <label htmlFor="p-perecedero" style={{ margin: 0, fontWeight: 400 }}>Vence (es perecedero)</label>
      </div>
      {error && <div className="mensaje-error">{error}</div>}
      <button className="boton" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar'}</button>
      <button type="button" className="boton secundario" onClick={alCerrar}>Cancelar</button>
      {producto && <button type="button" className="boton peligro" onClick={darDeBaja} disabled={enviando}>Dar de baja el producto</button>}
    </form>
  );
}

/* ───────── Menús ───────── */

// En pantalla el rendimiento se carga "cada 100 porciones", como lo piensa la cocina;
// en la base se guarda por porción.
const POR = 100;
const TEMPORADAS = { invierno: 'Invierno', verano: 'Verano' };

function Menus() {
  const { usuario } = useSesion();
  const edita = puede.editarMenus(usuario.rol);
  const { lista, error, recargar } = useLista('/menus');
  const [editando, setEditando] = useState(null);
  const [aviso, setAviso] = useState('');

  if (error) return <div className="mensaje-error">{error}</div>;
  if (!lista) return <p className="cargando">Cargando menús…</p>;

  const terminar = texto => { setEditando(null); setAviso(texto); recargar(); };
  if (editando) {
    return <FormMenu menu={editando === 'nuevo' ? null : editando} alCerrar={() => setEditando(null)} alGuardar={terminar} />;
  }

  return <>
    <p className="mini" style={{ marginBottom: 12 }}>
      Con estas cantidades se calcula lo que hace falta para cada actividad.
      {!edita && ' Las cambia la dirección.'}
    </p>
    <Aviso texto={aviso} alCerrar={() => setAviso('')} />
    {edita && <button className="boton secundario" style={{ marginTop: 0, marginBottom: 12 }} onClick={() => { setAviso(''); setEditando('nuevo'); }}>+ Nuevo menú</button>}
    {lista.map(m => (
      <div className="tarjeta" key={m.id_menu}>
        <div className="fila">
          <h3>{m.nombre_menu}</h3>
          {edita && <button className="enlace" onClick={() => { setAviso(''); setEditando(m); }}>Editar</button>}
        </div>
        <p className="mini" style={{ marginBottom: 6 }}>{TEMPORADAS[m.temporada]} · insumos cada {POR} porciones:</p>
        <ul className="lista-simple">
          {m.insumos.map(i => (
            <li key={i.id_menu_insumo}>{i.nombre_producto}: {num(i.cantidad_por_porcion * POR)} {i.unidad_medida}</li>
          ))}
        </ul>
      </div>
    ))}
  </>;
}

function FormMenu({ menu, alCerrar, alGuardar }) {
  const { lista: productos } = useLista('/productos');
  const [nombre, setNombre] = useState(menu ? menu.nombre_menu : '');
  const [temporada, setTemporada] = useState(menu ? menu.temporada : 'invierno');
  const [insumos, setInsumos] = useState(menu
    ? menu.insumos.map(i => ({ id_producto: String(i.id_producto), cantidad: String(Math.round(i.cantidad_por_porcion * POR * 100) / 100) }))
    : [{ id_producto: '', cantidad: '' }]);
  const { error, setError, enviando, enviar } = useEnvio();

  if (!productos) return <p className="cargando">Cargando productos…</p>;
  const elegibles = productos.filter(p => p.categoria !== 'dinero');
  const unidad = id => (elegibles.find(p => String(p.id_producto) === id) || {}).unidad_medida || '';
  const cambiarInsumo = (i, campo, valor) => setInsumos(insumos.map((x, j) => j === i ? { ...x, [campo]: valor } : x));

  async function guardar(e) {
    e.preventDefault();
    if (!nombre.trim()) return setError('Escribí el nombre del menú.');
    if (!insumos.length) return setError('El menú tiene que tener al menos un insumo.');
    for (const [i, x] of insumos.entries()) {
      if (!x.id_producto) return setError(`Elegí el producto del insumo ${i + 1}.`);
      if (!(Number(x.cantidad) > 0)) return setError(`La cantidad del insumo ${i + 1} tiene que ser mayor que cero.`);
    }
    const ids = insumos.map(x => x.id_producto);
    if (new Set(ids).size !== ids.length) return setError('Hay un producto cargado dos veces.');

    const cuerpo = {
      nombre_menu: nombre.trim(),
      temporada,
      insumos: insumos.map(x => ({ id_producto: Number(x.id_producto), cantidad_por_porcion: Number(x.cantidad) / POR })),
    };
    const ok = await enviar(() => menu
      ? api(`/menus/${menu.id_menu}`, { metodo: 'PUT', datos: cuerpo })
      : api('/menus', { metodo: 'POST', datos: cuerpo }));
    if (ok) alGuardar(menu
      ? `Se guardó ${cuerpo.nombre_menu}. Las actividades que lo usan ya calculan con las cantidades nuevas.`
      : `${cuerpo.nombre_menu} se agregó a los menús.`);
  }

  async function eliminar() {
    if (!window.confirm(`¿Eliminar el menú ${menu.nombre_menu}? No se puede deshacer.`)) return;
    const ok = await enviar(() => api(`/menus/${menu.id_menu}`, { metodo: 'DELETE' }));
    if (ok) alGuardar(`${menu.nombre_menu} se eliminó.`);
  }

  return (
    <form className="tarjeta" onSubmit={guardar} noValidate>
      <h3>{menu ? `Editar ${menu.nombre_menu}` : 'Nuevo menú'}</h3>
      <div className="dos">
        <div>
          <label htmlFor="m-nombre">Nombre</label>
          <input id="m-nombre" value={nombre} onChange={e => setNombre(e.target.value)} maxLength={100} />
        </div>
        <div>
          <label htmlFor="m-temporada">Temporada</label>
          <select id="m-temporada" value={temporada} onChange={e => setTemporada(e.target.value)}>
            {Object.entries(TEMPORADAS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </div>
      </div>

      <p className="mini" style={{ margin: '14px 0 4px' }}>Cuánto de cada insumo se usa cada {POR} porciones:</p>
      {insumos.map((x, i) => (
        <div className="insumo-menu" key={i}>
          <select aria-label={`Producto del insumo ${i + 1}`} value={x.id_producto} onChange={e => cambiarInsumo(i, 'id_producto', e.target.value)}>
            <option value="">Elegí un producto</option>
            {elegibles.map(p => <option key={p.id_producto} value={p.id_producto}>{p.nombre}</option>)}
          </select>
          <input aria-label={`Cantidad del insumo ${i + 1}`} type="number" min="0" step="any" inputMode="decimal"
                 value={x.cantidad} onChange={e => cambiarInsumo(i, 'cantidad', e.target.value)} />
          <span className="mini">{unidad(x.id_producto)}</span>
          <button type="button" className="enlace" onClick={() => setInsumos(insumos.filter((_, j) => j !== i))}>Quitar</button>
        </div>
      ))}
      <button type="button" className="enlace" style={{ marginTop: 6 }} onClick={() => setInsumos([...insumos, { id_producto: '', cantidad: '' }])}>
        + Agregar insumo
      </button>

      {error && <div className="mensaje-error">{error}</div>}
      <button className="boton" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar'}</button>
      <button type="button" className="boton secundario" onClick={alCerrar}>Cancelar</button>
      {menu && <button type="button" className="boton peligro" onClick={eliminar} disabled={enviando}>Eliminar menú</button>}
    </form>
  );
}

/* ───────── Destinos ───────── */

function Destinos() {
  const { lista, error, recargar } = useLista('/derivaciones/destinos');
  const [editando, setEditando] = useState(null);
  const [aviso, setAviso] = useState('');

  if (error) return <div className="mensaje-error">{error}</div>;
  if (!lista) return <p className="cargando">Cargando destinos…</p>;

  const terminar = texto => { setEditando(null); setAviso(texto); recargar(); };

  return <>
    <p className="mini" style={{ marginBottom: 12 }}>Comedores y organizaciones a los que se deriva mercadería.</p>
    <Aviso texto={aviso} alCerrar={() => setAviso('')} />
    {editando
      ? <FormDestino destino={editando === 'nuevo' ? null : editando} alCerrar={() => setEditando(null)} alGuardar={terminar} />
      : <button className="boton secundario" style={{ marginTop: 0, marginBottom: 12 }} onClick={() => { setAviso(''); setEditando('nuevo'); }}>+ Nuevo destino</button>}
    {!lista.length && <p className="mini">Todavía no hay destinos cargados.</p>}
    {lista.length > 0 && (
      <table>
        <thead><tr><th>Destino</th><th className="num">Tipo</th></tr></thead>
        <tbody>
          {lista.map(d => (
            <tr key={d.id_destino} className="fila-producto" onClick={() => { setAviso(''); setEditando(d); }}>
              <td><strong>{d.nombre}</strong></td>
              <td className="num">{TIPOS_DESTINO[d.tipo]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </>;
}

function FormDestino({ destino, alCerrar, alGuardar }) {
  const [datos, setDatos] = useState(destino ? { nombre: destino.nombre, tipo: destino.tipo } : { nombre: '', tipo: 'comedor' });
  const { error, setError, enviando, enviar } = useEnvio();

  async function guardar(e) {
    e.preventDefault();
    const nombre = datos.nombre.trim();
    if (!nombre) return setError('Escribí el nombre del destino.');
    const cuerpo = { ...datos, nombre };
    const ok = await enviar(() => destino
      ? api(`/derivaciones/destinos/${destino.id_destino}`, { metodo: 'PUT', datos: cuerpo })
      : api('/derivaciones/destinos', { metodo: 'POST', datos: cuerpo }));
    if (ok) alGuardar(destino ? `Se guardaron los cambios de ${nombre}.` : `${nombre} se agregó a los destinos.`);
  }

  return (
    <form className="tarjeta" onSubmit={guardar} noValidate>
      <h3>{destino ? `Editar ${destino.nombre}` : 'Nuevo destino'}</h3>
      <label htmlFor="d-nombre">Nombre</label>
      <input id="d-nombre" value={datos.nombre} onChange={e => setDatos({ ...datos, nombre: e.target.value })} maxLength={100} />
      <label htmlFor="d-tipo">Tipo</label>
      <select id="d-tipo" value={datos.tipo} onChange={e => setDatos({ ...datos, tipo: e.target.value })}>
        {Object.entries(TIPOS_DESTINO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
      {destino && <p className="mini" style={{ marginTop: 8 }}>Los destinos no se borran, para que las derivaciones registradas sigan mostrando a dónde fue la mercadería.</p>}
      {error && <div className="mensaje-error">{error}</div>}
      <button className="boton" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar'}</button>
      <button type="button" className="boton secundario" onClick={alCerrar}>Cancelar</button>
    </form>
  );
}

/* ───────── Usuarios ───────── */

function Usuarios() {
  const { lista, error, recargar } = useLista('/usuarios');
  const { lista: roles } = useLista('/usuarios/roles');
  const [editando, setEditando] = useState(null);
  const [aviso, setAviso] = useState('');

  if (error) return <div className="mensaje-error">{error}</div>;
  if (!lista || !roles) return <p className="cargando">Cargando usuarios…</p>;

  const terminar = texto => { setEditando(null); setAviso(texto); recargar(); };

  return <>
    <Aviso texto={aviso} alCerrar={() => setAviso('')} />
    {editando
      ? <FormUsuario persona={editando === 'nuevo' ? null : editando} roles={roles} alCerrar={() => setEditando(null)} alGuardar={terminar} />
      : <button className="boton secundario" style={{ marginTop: 0, marginBottom: 12 }} onClick={() => { setAviso(''); setEditando('nuevo'); }}>+ Nuevo usuario</button>}
    <table>
      <thead><tr><th>Persona</th><th className="num">Perfil</th></tr></thead>
      <tbody>
        {lista.map(u => (
          <tr key={u.id_usuario} className="fila-producto" onClick={() => { setAviso(''); setEditando(u); }}>
            <td>
              <strong>{u.nombre}</strong><br />
              <span className="mini">{u.email}</span>
            </td>
            <td className="num">
              {NOMBRES_PERFIL[u.nombre_rol] || u.nombre_rol}<br />
              {!u.activo && <span className="etiqueta falta">Desactivado</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </>;
}

function FormUsuario({ persona, roles, alCerrar, alGuardar }) {
  const { usuario } = useSesion();
  const soyYo = persona && persona.id_usuario === usuario.id;
  const [datos, setDatos] = useState(persona
    ? { nombre: persona.nombre, email: persona.email, id_rol: String(persona.id_rol), password: '' }
    : { nombre: '', email: '', id_rol: '', password: '' });
  const { error, setError, enviando, enviar } = useEnvio();
  const cambiar = campo => e => setDatos({ ...datos, [campo]: e.target.value });

  async function guardar(e) {
    e.preventDefault();
    const nombre = datos.nombre.trim();
    const email = datos.email.trim();
    if (!nombre) return setError('Escribí el nombre.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('El email no tiene un formato válido.');
    if (!datos.id_rol) return setError('Elegí un perfil.');
    if (!persona && !datos.password) return setError('Escribí una contraseña inicial.');
    if (datos.password && datos.password.length < 8) return setError('La contraseña tiene que tener al menos 8 caracteres.');

    const cuerpo = { nombre, email, id_rol: Number(datos.id_rol) };
    if (datos.password) cuerpo.password = datos.password;
    const ok = await enviar(() => persona
      ? api(`/usuarios/${persona.id_usuario}`, { metodo: 'PUT', datos: cuerpo })
      : api('/usuarios', { metodo: 'POST', datos: cuerpo }));
    if (ok) alGuardar(persona ? `Se guardaron los cambios de ${nombre}.` : `Se creó el usuario de ${nombre}.`);
  }

  async function cambiarActivo() {
    if (persona.activo) {
      if (!window.confirm(`¿Desactivar a ${persona.nombre}? No va a poder iniciar sesión. Lo que registró se conserva.`)) return;
      const ok = await enviar(() => api(`/usuarios/${persona.id_usuario}`, { metodo: 'DELETE' }));
      if (ok) alGuardar(`${persona.nombre} quedó desactivado.`);
    } else {
      const ok = await enviar(() => api(`/usuarios/${persona.id_usuario}`, { metodo: 'PUT', datos: { activo: true } }));
      if (ok) alGuardar(`${persona.nombre} puede volver a iniciar sesión.`);
    }
  }

  return (
    <form className="tarjeta" onSubmit={guardar} noValidate autoComplete="off">
      <h3>{persona ? `Editar ${persona.nombre}` : 'Nuevo usuario'}</h3>
      <label htmlFor="u-nombre">Nombre y apellido</label>
      <input id="u-nombre" value={datos.nombre} onChange={cambiar('nombre')} maxLength={100} />
      <label htmlFor="u-email">Email</label>
      <input id="u-email" type="email" value={datos.email} onChange={cambiar('email')} maxLength={120} />
      <label htmlFor="u-rol">Perfil</label>
      <select id="u-rol" value={datos.id_rol} onChange={cambiar('id_rol')} disabled={soyYo}>
        <option value="">Elegí un perfil</option>
        {roles.map(r => <option key={r.id_rol} value={r.id_rol}>{NOMBRES_PERFIL[r.nombre_rol] || r.nombre_rol}</option>)}
      </select>
      {soyYo && <p className="mini">No podés cambiar tu propio perfil.</p>}
      <label htmlFor="u-clave">{persona ? 'Nueva contraseña' : 'Contraseña inicial'}</label>
      <input id="u-clave" type="password" value={datos.password} onChange={cambiar('password')} autoComplete="new-password"
             placeholder={persona ? 'Dejala vacía para no cambiarla' : 'Al menos 8 caracteres'} />
      {error && <div className="mensaje-error">{error}</div>}
      <button className="boton" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar'}</button>
      <button type="button" className="boton secundario" onClick={alCerrar}>Cancelar</button>
      {persona && !soyYo && (
        <button type="button" className={'boton ' + (persona.activo ? 'peligro' : 'secundario')} onClick={cambiarActivo} disabled={enviando}>
          {persona.activo ? 'Desactivar usuario' : 'Volver a activar'}
        </button>
      )}
    </form>
  );
}
