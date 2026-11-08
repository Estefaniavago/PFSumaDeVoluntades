import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useSesion } from '../sesion';
import { puede } from '../permisos';
import { num, fecha, diasHasta, TIPOS_ACTIVIDAD } from '../formato';

// Categorías que se consumen y por eso necesitan un mínimo deseable (la ropa o los muebles no)
const CON_MINIMO = ['alimento', 'descartable', 'limpieza'];
const DIAS_ACTIVIDAD = 7;

// Junta los avisos pendientes del perfil: lo que falta para las próximas actividades, lo que está
// bajo el mínimo, lo que vence pronto y, para quien mantiene el catálogo, los productos sin mínimo.
async function cargarAvisos(rol) {
  const [alertas, actividades, productos] = await Promise.all([
    api('/alertas'),
    api('/actividades'),
    puede.editarProductos(rol) ? api('/productos') : Promise.resolve([]),
  ]);

  const proximas = actividades
    .filter(a => a.estado === 'planificada' && a.id_menu)
    .filter(a => { const d = diasHasta(a.fecha_hora_salida); return d >= 0 && d <= DIAS_ACTIVIDAD; })
    .sort((x, y) => new Date(x.fecha_hora_salida) - new Date(y.fecha_hora_salida));
  const presupuestos = await Promise.all(proximas.map(a =>
    api(`/actividades/${a.id_actividad}/presupuesto`).then(p => [a, p.insumos.filter(i => i.faltante > 0)]).catch(() => [a, []])));

  const avisos = [];
  for (const [a, faltan] of presupuestos) {
    if (!faltan.length) continue;
    avisos.push({
      clave: 'act' + a.id_actividad, tipo: 'critica', ruta: `/actividades/${a.id_actividad}`,
      titulo: `Falta ${faltan.map(i => i.nombre.toLowerCase()).join(', ')} para ${TIPOS_ACTIVIDAD[a.tipo_actividad].toLowerCase()} del ${fecha(a.fecha_hora_salida)}`,
      detalle: faltan.map(i => `${i.nombre}: faltan ${num(i.faltante)} ${i.unidad_medida}`).join(' · '),
    });
  }
  for (const p of alertas.stock_bajo_minimo) {
    avisos.push({
      clave: 'min' + p.id_producto, tipo: 'critica', ruta: '/deposito',
      titulo: `${p.nombre}: por debajo del mínimo`,
      detalle: `Hay ${num(p.stock_actual)} ${p.unidad_medida} y el mínimo es ${num(p.minimo_deseable)}.`,
    });
  }
  for (const l of alertas.proximos_a_vencer) {
    const dias = diasHasta(l.fecha_vencimiento);
    avisos.push({
      clave: 'ven' + l.id_donacion, tipo: 'aviso', ruta: '/deposito',
      titulo: `${l.producto}: ${dias === 0 ? 'vence hoy' : `vence el ${fecha(l.fecha_vencimiento)}`}`,
      detalle: `Quedan ${num(l.stock_actual_lote)} en el lote. Conviene usarlo o derivarlo a tiempo.`,
    });
  }
  const sinMinimo = productos.filter(p => CON_MINIMO.includes(p.categoria) && Number(p.minimo_deseable) === 0);
  if (sinMinimo.length) {
    avisos.push({
      clave: 'catalogo', tipo: 'aviso', ruta: '/gestion',
      titulo: sinMinimo.length === 1 ? `${sinMinimo[0].nombre}: falta definir el mínimo` : `${sinMinimo.length} productos sin mínimo deseable`,
      detalle: sinMinimo.length === 1 ? 'Se completa en Gestión → Productos.' : `${sinMinimo.map(p => p.nombre).join(', ')}. Se completa en Gestión → Productos.`,
    });
  }
  return avisos;
}

// Campana del encabezado, como en el prototipo: muestra cuántos avisos hay y los lista al tocarla
export default function Avisos() {
  const { usuario } = useSesion();
  const { pathname } = useLocation();
  const navegar = useNavigate();
  const [avisos, setAvisos] = useState(null);
  const [abierto, setAbierto] = useState(false);
  const panel = useRef(null);

  const actualizar = useCallback(() => {
    cargarAvisos(usuario.rol).then(setAvisos).catch(() => setAvisos(null));
  }, [usuario.rol]);

  // Se recalculan al cambiar de pantalla, así reflejan lo que se acaba de cargar
  useEffect(() => { actualizar(); }, [actualizar, pathname]);

  // Se cierra al tocar fuera del panel o con Escape
  useEffect(() => {
    if (!abierto) return;
    const fuera = e => { if (panel.current && !panel.current.contains(e.target)) setAbierto(false); };
    const tecla = e => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', tecla); };
  }, [abierto]);

  const cantidad = avisos ? avisos.length : 0;
  const ir = ruta => { setAbierto(false); navegar(ruta); };

  return (
    <div className="avisos" ref={panel}>
      <button type="button" className="campana" onClick={() => setAbierto(!abierto)}
              aria-label={cantidad ? `${cantidad} avisos pendientes` : 'Sin avisos pendientes'} aria-expanded={abierto}>
        <span aria-hidden="true">🔔</span>
        {cantidad > 0 && <span className="badge">{cantidad > 9 ? '9+' : cantidad}</span>}
      </button>
      {abierto && (
        <div className="panel-avisos" role="dialog" aria-label="Avisos">
          <h4>Avisos</h4>
          {!avisos && <p className="mini">No se pudieron cargar los avisos.</p>}
          {avisos && !avisos.length && <p className="mini">No tenés avisos pendientes.</p>}
          {avisos && avisos.map(a => (
            <button type="button" key={a.clave} className={'aviso-item ' + a.tipo} onClick={() => ir(a.ruta)}>
              <b>{a.titulo}</b>
              <span>{a.detalle}</span>
            </button>
          ))}
          <button type="button" className="cerrar" onClick={() => setAbierto(false)}>Cerrar</button>
        </div>
      )}
    </div>
  );
}
