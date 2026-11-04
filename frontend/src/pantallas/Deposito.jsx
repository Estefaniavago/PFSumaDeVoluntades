import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useSesion } from '../sesion';
import { puede } from '../permisos';
import { num, fecha, diasHasta } from '../formato';

// Mismo plazo que usan las alertas del inicio
const DIAS_AVISO = 7;

const ESTADOS_LOTE = {
  recibida: 'Recibido', disponible: 'Disponible', proxima_a_vencer: 'Por vencer',
  reservada: 'Reservado', entregada: 'Entregado', derivada: 'Derivado', vencida_descartada: 'Dado de baja',
};

const FILTROS = [
  { id: 'todo', nombre: 'Todo' },
  { id: 'minimo', nombre: 'Bajo mínimo' },
  { id: 'vence', nombre: 'Por vencer' },
];

// Estado de un producto según su stock, su mínimo y el lote que vence primero
function estadoProducto(p) {
  const stock = Number(p.stock_total);
  const minimo = Number(p.minimo_deseable);
  const vence = p.lotes.find(l => l.fecha_vencimiento && l.cantidad_actual > 0);
  const dias = vence ? diasHasta(vence.fecha_vencimiento) : null;

  if (dias !== null && dias < 0) return { clave: 'vencido', texto: `Vencido el ${fecha(vence.fecha_vencimiento)}`, clase: 'falta', fila: true };
  if (minimo > 0 && stock < minimo) return { clave: 'minimo', texto: 'Por debajo del mínimo', clase: 'falta', fila: true };
  if (dias !== null && dias <= DIAS_AVISO) return { clave: 'vence', texto: dias === 0 ? 'Vence hoy' : `Vence el ${fecha(vence.fecha_vencimiento)}`, clase: 'baja' };
  if (stock <= 0) return { clave: 'sin-stock', texto: 'Sin stock', clase: 'baja' };
  if (minimo === 0) return { clave: 'sin-minimo', texto: 'Mínimo a definir', clase: 'baja' };
  return { clave: 'ok', texto: 'En orden', clase: 'ok' };
}

export default function Deposito() {
  const { usuario } = useSesion();
  const corrige = puede.corregirStock(usuario.rol);
  const [productos, setProductos] = useState(null);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState('todo');
  const [abierto, setAbierto] = useState(null);
  const [accion, setAccion] = useState(null); // { tipo, lote, producto }
  const [aviso, setAviso] = useState('');
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    api('/stock')
      .then(lista => setProductos(lista
        .filter(p => p.categoria !== 'dinero')
        .map(p => ({
          ...p,
          // Solo interesan los lotes que todavía tienen algo
          lotes: p.lotes.map(l => ({ ...l, cantidad_actual: Number(l.cantidad_actual) })).filter(l => l.cantidad_actual > 0),
        }))
        .map(p => ({ ...p, estado: estadoProducto(p) }))))
      .catch(err => setError(err.message));
  }, [vuelta]);

  if (error) return <><h2>Depósito central</h2><div className="mensaje-error">{error}</div></>;
  if (!productos) return <><h2>Depósito central</h2><p className="cargando">Cargando el stock…</p></>;

  const cumple = (p, f) => f === 'todo'
    || (f === 'minimo' && p.estado.clave === 'minimo')
    || (f === 'vence' && ['vence', 'vencido'].includes(p.estado.clave));
  const texto = busqueda.trim().toLowerCase();
  const visibles = productos.filter(p => cumple(p, filtro) && p.nombre.toLowerCase().includes(texto));

  const terminarAccion = mensaje => { setAccion(null); setAviso(mensaje); setVuelta(v => v + 1); };

  return (
    <div className="angosta">
      <div className="fila">
        <h2>Depósito central</h2>
        <Link to="/deposito/historial" className="enlace">Ver movimientos</Link>
      </div>
      <p className="ayuda">Lo que hay hoy, sin tener que ir a contar. Tocá un producto para ver sus lotes.</p>

      {aviso && <div className="mensaje-ok" style={{ marginTop: 0, marginBottom: 12 }} role="status" onClick={() => setAviso('')}>{aviso}</div>}

      <div className="segmentos" role="tablist">
        {FILTROS.map(f => (
          <button key={f.id} type="button" className={filtro === f.id ? 'activo' : ''} onClick={() => setFiltro(f.id)}>
            {f.nombre}{f.id !== 'todo' && ` (${productos.filter(p => cumple(p, f.id)).length})`}
          </button>
        ))}
      </div>

      <input type="search" placeholder="Buscar un producto" aria-label="Buscar un producto"
             value={busqueda} onChange={e => setBusqueda(e.target.value)} style={{ marginBottom: 12 }} />

      {!visibles.length ? (
        <p className="mini">No hay productos que coincidan.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Producto</th><th className="num">Disponible</th></tr>
          </thead>
          <tbody>
            {visibles.map(p => (
              <Fragment key={p.id_producto}>
                <tr className={'fila-producto' + (p.estado.fila ? ' falta' : '')}
                    onClick={() => { setAccion(null); setAbierto(abierto === p.id_producto ? null : p.id_producto); }}
                    aria-expanded={abierto === p.id_producto}>
                  <td>
                    <strong>{p.nombre}</strong><br />
                    <span className={'etiqueta ' + p.estado.clase}>{p.estado.texto}</span>
                  </td>
                  <td className="num">
                    {num(p.stock_total)} {p.unidad_medida}<br />
                    <span className="mini">{Number(p.minimo_deseable) > 0 ? `mínimo ${num(p.minimo_deseable)}` : 'sin mínimo'}</span>
                  </td>
                </tr>
                {abierto === p.id_producto && (
                  <tr className="lotes">
                    <td colSpan={2}>
                      {!p.lotes.length ? (
                        <p className="mini">No queda ningún lote de este producto.</p>
                      ) : p.lotes.map(l => {
                        const vencido = l.fecha_vencimiento && diasHasta(l.fecha_vencimiento) < 0;
                        const abiertaAca = accion && accion.lote.id_donacion === l.id_donacion;
                        return (
                          <div className="lote" key={l.id_donacion}>
                            <div>
                              <strong>{num(l.cantidad_actual)} {p.unidad_medida}</strong>
                              <span className="mini"> de {num(l.cantidad_inicial)} · <Link to={`/remitos/${l.id_remito}`} className="enlace-suave">remito {l.nro_remito}</Link> del {fecha(l.fecha_hora_ingreso)}</span>
                            </div>
                            <div className="mini">
                              {l.fecha_vencimiento ? `${vencido ? 'Venció' : 'Vence'} el ${fecha(l.fecha_vencimiento)}` : 'Sin vencimiento'}
                              {' · '}{ESTADOS_LOTE[l.estado_lote] || l.estado_lote}
                            </div>
                            <div className="acciones-lote">
                              {corrige && <>
                                <button type="button" className="enlace" onClick={() => setAccion({ tipo: 'baja', lote: l, producto: p })}>Dar de baja</button>
                                <button type="button" className="enlace" onClick={() => setAccion({ tipo: 'derivacion', lote: l, producto: p })}>Derivar</button>
                                <button type="button" className="enlace" onClick={() => setAccion({ tipo: 'ajuste', lote: l, producto: p })}>Corregir cantidad</button>
                              </>}
                              <Link to={`/deposito/historial?lote=${l.id_donacion}`} className="enlace">Movimientos</Link>
                            </div>
                            {abiertaAca && <AccionLote {...accion} alCerrar={() => setAccion(null)} alTerminar={terminarAccion} />}
                          </div>
                        );
                      })}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ───────── Baja, derivación o ajuste de un lote ───────── */

const MOTIVOS_BAJA = ['Vencido', 'En mal estado', 'Envase roto o abierto'];

function AccionLote({ tipo, lote, producto, alCerrar, alTerminar }) {
  const disponible = lote.cantidad_actual;
  const vencido = lote.fecha_vencimiento && diasHasta(lote.fecha_vencimiento) < 0;
  const [cantidad, setCantidad] = useState(tipo === 'ajuste' ? '' : String(disponible));
  const [sentido, setSentido] = useState('menos'); // ajuste: hay menos o más de lo registrado
  const [motivo, setMotivo] = useState(tipo === 'baja' ? (vencido ? 'Vencido' : '') : '');
  const [destinos, setDestinos] = useState(null);
  const [idDestino, setIdDestino] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const u = producto.unidad_medida;

  useEffect(() => {
    if (tipo === 'derivacion') api('/derivaciones/destinos').then(setDestinos).catch(err => setError(err.message));
  }, [tipo]);

  const titulos = {
    baja: `Dar de baja ${producto.nombre.toLowerCase()}`,
    derivacion: `Derivar ${producto.nombre.toLowerCase()} a otro comedor`,
    ajuste: `Corregir la cantidad de ${producto.nombre.toLowerCase()}`,
  };

  async function confirmar(e) {
    e.preventDefault();
    setError('');
    const c = Number(String(cantidad).replace(',', '.'));
    if (!(c > 0)) return setError('La cantidad tiene que ser mayor que cero.');
    const restaStock = tipo !== 'ajuste' || sentido === 'menos';
    if (restaStock && c > disponible) return setError(`En este lote quedan ${num(disponible)} ${u}; no se puede sacar más.`);
    if (tipo === 'derivacion' && !idDestino) return setError('Elegí a dónde va la mercadería.');
    if (!motivo.trim()) return setError(tipo === 'ajuste' ? 'Contá por qué se corrige (por ejemplo, "recuento del sábado").' : 'Indicá el motivo.');

    const destino = destinos && destinos.find(d => String(d.id_destino) === idDestino);
    const resumen = {
      baja: `¿Dar de baja ${num(c)} ${u} de ${producto.nombre}? Queda registrado y no se puede deshacer.`,
      derivacion: `¿Derivar ${num(c)} ${u} de ${producto.nombre} a ${destino && destino.nombre}?`,
      ajuste: `¿Registrar que hay ${num(c)} ${u} ${sentido === 'menos' ? 'menos' : 'más'} de ${producto.nombre} de lo que figuraba?`,
    }[tipo];
    if (!window.confirm(resumen)) return;

    const datos = { id_donacion: lote.id_donacion, motivo: motivo.trim() };
    let ruta = '/bajas';
    if (tipo === 'baja') datos.cantidad = c;
    if (tipo === 'derivacion') { ruta = '/derivaciones'; datos.cantidad = c; datos.id_destino = Number(idDestino); }
    if (tipo === 'ajuste') { ruta = '/ajustes'; datos.cantidad = sentido === 'menos' ? -c : c; }

    setEnviando(true);
    try {
      await api(ruta, { metodo: 'POST', datos });
      alTerminar({
        baja: `Se dieron de baja ${num(c)} ${u} de ${producto.nombre}.`,
        derivacion: `Se derivaron ${num(c)} ${u} de ${producto.nombre} a ${destino && destino.nombre}.`,
        ajuste: `Se corrigió el stock de ${producto.nombre}: ${sentido === 'menos' ? '−' : '+'}${num(c)} ${u}.`,
      }[tipo]);
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  return (
    <form className="tarjeta accion-lote" onSubmit={confirmar} noValidate>
      <h3>{titulos[tipo]}</h3>

      {tipo === 'ajuste' && <>
        <p className="mini">Para cuando al contar hay una diferencia con lo registrado. Lo cargado no se borra: queda el ajuste con su motivo.</p>
        <label htmlFor="a-sentido">Al contar, hay…</label>
        <select id="a-sentido" value={sentido} onChange={e => setSentido(e.target.value)}>
          <option value="menos">Menos de lo que figura</option>
          <option value="mas">Más de lo que figura</option>
        </select>
      </>}

      {tipo === 'derivacion' && <>
        <label htmlFor="a-destino">¿A dónde va?</label>
        <select id="a-destino" value={idDestino} onChange={e => setIdDestino(e.target.value)}>
          <option value="">{destinos ? 'Elegí un destino' : 'Cargando…'}</option>
          {(destinos || []).map(d => <option key={d.id_destino} value={d.id_destino}>{d.nombre}</option>)}
        </select>
        <p className="mini">Los destinos se agregan en Gestión → Destinos.</p>
      </>}

      <label htmlFor="a-cantidad">{tipo === 'ajuste' ? 'Diferencia' : 'Cantidad'} ({u})</label>
      <input id="a-cantidad" type="number" min="0" step="any" inputMode="decimal" value={cantidad} onChange={e => setCantidad(e.target.value)} />
      {tipo !== 'ajuste' && <p className="mini">En este lote quedan {num(disponible)} {u}.</p>}

      <label htmlFor="a-motivo">Motivo</label>
      {tipo === 'baja' && (
        <div className="opciones-rapidas">
          {MOTIVOS_BAJA.map(m => (
            <button type="button" key={m} className={'etiqueta' + (motivo === m ? ' ok' : '')} onClick={() => setMotivo(m)}>{m}</button>
          ))}
        </div>
      )}
      <input id="a-motivo" value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={200}
             placeholder={tipo === 'derivacion' ? 'Por ejemplo: sobrestock, vence pronto' : tipo === 'ajuste' ? 'Por ejemplo: recuento del sábado' : 'Otro motivo'} />

      {error && <div className="mensaje-error">{error}</div>}
      <div className="dos" style={{ marginTop: 4 }}>
        <button type="button" className="boton secundario" onClick={alCerrar}>Cancelar</button>
        <button className="boton" disabled={enviando}>{enviando ? 'Guardando…' : 'Confirmar'}</button>
      </div>
    </form>
  );
}
