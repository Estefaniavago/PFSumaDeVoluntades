import { Fragment, useEffect, useState } from 'react';
import { api } from '../api';
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
  const [productos, setProductos] = useState(null);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState('todo');
  const [abierto, setAbierto] = useState(null);

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
  }, []);

  if (error) return <><h2>Depósito central</h2><div className="mensaje-error">{error}</div></>;
  if (!productos) return <><h2>Depósito central</h2><p className="cargando">Cargando el stock…</p></>;

  const cumple = (p, f) => f === 'todo'
    || (f === 'minimo' && p.estado.clave === 'minimo')
    || (f === 'vence' && ['vence', 'vencido'].includes(p.estado.clave));
  const texto = busqueda.trim().toLowerCase();
  const visibles = productos.filter(p => cumple(p, filtro) && p.nombre.toLowerCase().includes(texto));

  return (
    <div className="angosta">
      <h2>Depósito central</h2>
      <p className="ayuda">Lo que hay hoy, sin tener que ir a contar. Tocá un producto para ver sus lotes.</p>

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
                    onClick={() => setAbierto(abierto === p.id_producto ? null : p.id_producto)}
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
                      ) : p.lotes.map(l => (
                        <div className="lote" key={l.id_donacion}>
                          <div>
                            <strong>{num(l.cantidad_actual)} {p.unidad_medida}</strong>
                            <span className="mini"> de {num(l.cantidad_inicial)} · remito {l.nro_remito} del {fecha(l.fecha_hora_ingreso)}</span>
                          </div>
                          <div className="mini">
                            {l.fecha_vencimiento ? `Vence el ${fecha(l.fecha_vencimiento)}` : 'Sin vencimiento'}
                            {' · '}{ESTADOS_LOTE[l.estado_lote] || l.estado_lote}
                          </div>
                        </div>
                      ))}
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
