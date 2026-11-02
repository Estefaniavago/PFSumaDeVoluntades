import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useSesion } from '../sesion';
import { puede } from '../permisos';
import { num, fechaHora, TIPOS_ACTIVIDAD } from '../formato';

const CATEGORIAS = [
  ['alimento', 'Alimento'], ['descartable', 'Descartable'], ['limpieza', 'Limpieza'],
  ['ropa', 'Ropa'], ['mobiliario', 'Mobiliario'],
];
const UNIDADES = ['kg', 'litros', 'unidades', 'cajas', 'paquetes'];
const NUEVO = 'nuevo';
const hoy = () => new Date().toLocaleDateString('en-CA');
const itemVacio = () => ({ id_producto: '', cantidad: '', fecha_vencimiento: '' });

export default function Ingreso() {
  const { usuario } = useSesion();
  const [tipo, setTipo] = useState('mercaderia');
  const [productos, setProductos] = useState([]);
  const [actividades, setActividades] = useState([]);
  const [items, setItems] = useState([itemVacio()]);
  const [donante, setDonante] = useState('');
  const [anonima, setAnonima] = useState(false);
  const [idActividad, setIdActividad] = useState('');
  const [monto, setMonto] = useState('');
  const [nuevo, setNuevo] = useState(null); // { indice, nombre, categoria, unidad_medida, perecedero }
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api('/productos').then(setProductos).catch(err => setError(err.message));
    api('/actividades')
      .then(act => setActividades(act.filter(a => a.estado === 'planificada')))
      .catch(() => setActividades([]));
  }, []);

  // El dinero se registra aparte (aportes), así que no aparece en la lista de mercadería
  const mercaderia = productos.filter(p => p.categoria !== 'dinero');
  const producto = id => productos.find(p => p.id_producto === Number(id));

  function cambiarItem(i, campo, valor) {
    if (campo === 'id_producto' && valor === NUEVO) {
      setNuevo({ indice: i, nombre: '', categoria: 'alimento', unidad_medida: 'kg', perecedero: false });
      return;
    }
    setItems(items.map((it, n) => (n === i ? { ...it, [campo]: valor } : it)));
  }

  async function crearProducto() {
    setError('');
    if (!nuevo.nombre.trim()) {
      setError('Escribí el nombre del producto nuevo.');
      return;
    }
    try {
      const { producto: creado } = await api('/productos', {
        metodo: 'POST',
        datos: { nombre: nuevo.nombre.trim(), categoria: nuevo.categoria, unidad_medida: nuevo.unidad_medida, perecedero: nuevo.perecedero },
      });
      setProductos([...productos, creado].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setItems(items.map((it, n) => (n === nuevo.indice ? { ...it, id_producto: String(creado.id_producto) } : it)));
      setNuevo(null);
    } catch (err) {
      setError(err.message);
    }
  }

  // Mismas reglas que el servidor, para avisar antes de enviar (RF-11, RNF-03)
  function validar() {
    if (tipo === 'dinero') {
      const m = Number(monto);
      return monto !== '' && Number.isFinite(m) && m > 0 ? null : 'El monto tiene que ser un número mayor que cero.';
    }
    for (const [i, it] of items.entries()) {
      const n = items.length > 1 ? `Producto ${i + 1}: ` : '';
      const p = producto(it.id_producto);
      const cantidad = Number(it.cantidad);
      if (!p) return `${n}elegí qué llegó.`;
      if (it.cantidad === '' || !Number.isFinite(cantidad) || cantidad <= 0) return `${n}la cantidad tiene que ser un número mayor que cero.`;
      if (p.perecedero && !it.fecha_vencimiento) return `${n}${p.nombre} es perecedero: indicá la fecha de vencimiento.`;
      if (it.fecha_vencimiento && it.fecha_vencimiento < hoy()) return `${n}la fecha de vencimiento ya pasó. Revisala.`;
    }
    return null;
  }

  async function registrar(e) {
    e.preventDefault();
    setError('');
    const problema = validar();
    if (problema) {
      setError(problema.charAt(0).toUpperCase() + problema.slice(1));
      return;
    }
    // Cantidades fuera de lo habitual: se pide confirmación por si es un error de tipeo
    const grandes = items.filter(it => Number(it.cantidad) > 1000);
    if (tipo === 'mercaderia' && grandes.length &&
        !window.confirm(grandes.map(it => `${num(it.cantidad)} ${producto(it.id_producto).unidad_medida} de ${producto(it.id_producto).nombre}`).join('\n') +
          '\n\n¿Las cantidades son correctas?')) {
      return;
    }

    setEnviando(true);
    try {
      const datosDonante = { anonima, donante_nombre: anonima ? null : donante.trim() };
      if (tipo === 'dinero') {
        const r = await api('/aportes', { metodo: 'POST', datos: { ...datosDonante, monto: Number(monto) } });
        setResultado({ remito: r.remito.nro_remito, detalle: [`Aporte de $ ${num(monto)}`] });
      } else {
        const r = await api('/donaciones', {
          metodo: 'POST',
          datos: {
            ...datosDonante,
            items: items.map(it => ({
              id_producto: Number(it.id_producto),
              cantidad: Number(it.cantidad),
              ...(it.fecha_vencimiento && { fecha_vencimiento: it.fecha_vencimiento }),
              ...(idActividad && { id_actividad: Number(idActividad) }),
            })),
          },
        });
        setResultado({
          remito: r.remito.nro_remito,
          detalle: items.map(it => `${num(it.cantidad)} ${producto(it.id_producto).unidad_medida} de ${producto(it.id_producto).nombre}`),
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  function otraDonacion() {
    setItems([itemVacio()]); setDonante(''); setAnonima(false); setIdActividad(''); setMonto('');
    setResultado(null); setError('');
  }

  if (resultado) {
    return (
      <div className="angosta">
        <h2>Donación registrada</h2>
        <div className="mensaje-ok" role="status">
          <b>Remito {resultado.remito}</b>
          <ul style={{ margin: '6px 0 0 18px' }}>{resultado.detalle.map(d => <li key={d}>{d}</li>)}</ul>
        </div>
        <p className="mini" style={{ marginTop: 10 }}>
          Quedó registrado que la cargaste vos, {usuario.nombre.split(' ')[0]}, con la fecha y la hora.
        </p>
        <button className="boton" onClick={otraDonacion}>Cargar otra donación</button>
        {puede.verStock(usuario.rol) && <Link to="/deposito" className="boton secundario" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>Ver el depósito</Link>}
      </div>
    );
  }

  return (
    <form className="angosta" onSubmit={registrar} noValidate>
      <h2>Ingresar una donación</h2>
      <p className="ayuda">La carga quien recibe la donación, desde el celular, apenas llega.</p>

      <div className="segmentos" role="tablist">
        <button type="button" className={tipo === 'mercaderia' ? 'activo' : ''} onClick={() => setTipo('mercaderia')}>Mercadería</button>
        <button type="button" className={tipo === 'dinero' ? 'activo' : ''} onClick={() => setTipo('dinero')}>Aporte en dinero</button>
      </div>

      {tipo === 'mercaderia' && items.map((it, i) => {
        const p = producto(it.id_producto);
        return (
          <div className="tarjeta item-donacion" key={i}>
            {items.length > 1 && (
              <div className="fila">
                <b className="mini">Producto {i + 1}</b>
                <button type="button" className="enlace" onClick={() => setItems(items.filter((_, n) => n !== i))}>Quitar</button>
              </div>
            )}
            <label htmlFor={`producto-${i}`}>¿Qué llegó?</label>
            <select id={`producto-${i}`} value={it.id_producto} onChange={e => cambiarItem(i, 'id_producto', e.target.value)}>
              <option value="">Elegí un producto</option>
              {mercaderia.map(p => <option key={p.id_producto} value={p.id_producto}>{p.nombre}</option>)}
              {puede.crearProducto(usuario.rol) && <option value={NUEVO}>+ Agregar producto nuevo</option>}
            </select>

            {nuevo && nuevo.indice === i && (
              <div className="tarjeta" style={{ marginTop: 10 }}>
                <label htmlFor="nombre-nuevo" style={{ marginTop: 0 }}>Nombre del producto</label>
                <input id="nombre-nuevo" value={nuevo.nombre} placeholder="Por ejemplo: lentejas" autoFocus
                       onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} />
                <div className="dos">
                  <div>
                    <label htmlFor="categoria-nueva">Categoría</label>
                    <select id="categoria-nueva" value={nuevo.categoria} onChange={e => setNuevo({ ...nuevo, categoria: e.target.value })}>
                      {CATEGORIAS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="unidad-nueva">Unidad</label>
                    <select id="unidad-nueva" value={nuevo.unidad_medida} onChange={e => setNuevo({ ...nuevo, unidad_medida: e.target.value })}>
                      {UNIDADES.map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
                <div className="check">
                  <input type="checkbox" id="perecedero-nuevo" checked={nuevo.perecedero}
                         onChange={e => setNuevo({ ...nuevo, perecedero: e.target.checked })} />
                  <label htmlFor="perecedero-nuevo" style={{ margin: 0, fontWeight: 400 }}>Vence (es perecedero)</label>
                </div>
                <p className="mini" style={{ marginTop: 8 }}>Se suma al catálogo para todos. La dirección después define el mínimo deseable.</p>
                <div className="dos">
                  <button type="button" className="boton secundario" onClick={() => setNuevo(null)}>Cancelar</button>
                  <button type="button" className="boton" onClick={crearProducto}>Agregar</button>
                </div>
              </div>
            )}

            <div className="dos">
              <div>
                <label htmlFor={`cantidad-${i}`}>Cantidad</label>
                <input id={`cantidad-${i}`} type="number" inputMode="decimal" min="0" step="any" value={it.cantidad}
                       onChange={e => cambiarItem(i, 'cantidad', e.target.value)} />
              </div>
              <div>
                <label>Unidad</label>
                <input value={p ? p.unidad_medida : ''} readOnly disabled placeholder="—" />
              </div>
            </div>

            <label htmlFor={`vence-${i}`}>Vence el {p && p.perecedero ? '' : '(si corresponde)'}</label>
            <input id={`vence-${i}`} type="date" min={hoy()} value={it.fecha_vencimiento}
                   onChange={e => cambiarItem(i, 'fecha_vencimiento', e.target.value)} />
          </div>
        );
      })}

      {tipo === 'mercaderia' && (
        <button type="button" className="boton secundario" style={{ marginTop: 0 }}
                onClick={() => setItems([...items, itemVacio()])}>+ Otro producto en la misma donación</button>
      )}

      {tipo === 'dinero' && (
        <>
          <label htmlFor="monto">Monto en pesos</label>
          <input id="monto" type="number" inputMode="decimal" min="0" step="any" value={monto} onChange={e => setMonto(e.target.value)} />
          <p className="mini" style={{ marginTop: 6 }}>El sistema registra el aporte, pero no gestiona pagos ni caja.</p>
        </>
      )}

      <label htmlFor="donante">¿Quién la trajo?</label>
      <input id="donante" placeholder="Nombre del donante o empresa (si se conoce)" value={donante} disabled={anonima}
             onChange={e => setDonante(e.target.value)} />
      <div className="check">
        <input type="checkbox" id="anonima" checked={anonima} onChange={e => setAnonima(e.target.checked)} />
        <label htmlFor="anonima" style={{ margin: 0, fontWeight: 400 }}>Quiere quedar como anónimo</label>
      </div>
      <p className="mini" style={{ marginTop: 6 }}>La donación se registra igual. Solo no se muestra el nombre.</p>

      {tipo === 'mercaderia' && (
        <>
          <label htmlFor="actividad">¿Para qué actividad? (opcional)</label>
          <select id="actividad" value={idActividad} onChange={e => setIdActividad(e.target.value)}>
            <option value="">Sin asignar, va al depósito</option>
            {actividades.map(a => (
              <option key={a.id_actividad} value={a.id_actividad}>
                {TIPOS_ACTIVIDAD[a.tipo_actividad]} · {fechaHora(a.fecha_hora_salida)}
              </option>
            ))}
          </select>
        </>
      )}

      {error && <div className="mensaje-error" role="alert">{error}</div>}

      <button className="boton" type="submit" disabled={enviando}>{enviando ? 'Registrando…' : 'Registrar donación'}</button>
      <p className="mini" style={{ marginTop: 12 }}>Queda registrado quién la cargó y a qué hora.</p>
    </form>
  );
}
