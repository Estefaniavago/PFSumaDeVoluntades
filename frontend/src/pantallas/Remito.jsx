import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { num, fecha, fechaHora } from '../formato';

// Comprobante de ingreso de una donación (RF-02), listo para imprimir o guardar como PDF
export default function Remito() {
  const { id } = useParams();
  const navegar = useNavigate();
  const [remito, setRemito] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/remitos/${id}`).then(setRemito).catch(err => setError(err.message));
  }, [id]);

  if (error) return <div className="angosta"><h2>Remito</h2><div className="mensaje-error">{error}</div></div>;
  if (!remito) return <p className="cargando">Cargando el remito…</p>;

  const dinero = remito.items.every(i => i.categoria === 'dinero');

  return (
    <div className="angosta">
      <div className="remito tarjeta">
        <div className="remito-encabezado">
          <img src="/logo.png" alt="Suma de Voluntades" />
          <div>
            <p className="mini">Asociación Civil Suma de Voluntades</p>
            <h2>{dinero ? 'Comprobante de aporte' : 'Remito de ingreso'}</h2>
            <p><strong>{remito.nro_remito}</strong></p>
          </div>
        </div>

        <dl className="remito-datos">
          <dt>Fecha y hora</dt><dd>{fechaHora(remito.fecha_hora_ingreso)}</dd>
          <dt>Donante</dt><dd>{remito.anonima ? 'Anónimo' : remito.donante_nombre || 'Sin datos'}</dd>
          <dt>Recibió</dt><dd>{remito.recibido_por}</dd>
        </dl>

        <table>
          <thead>
            <tr><th>{dinero ? 'Concepto' : 'Producto'}</th><th className="num">Cantidad</th>{!dinero && <th className="num">Vence</th>}</tr>
          </thead>
          <tbody>
            {remito.items.map(i => (
              <tr key={i.id_donacion}>
                <td>{i.producto}</td>
                <td className="num">{dinero ? `$ ${num(i.cantidad_inicial)}` : `${num(i.cantidad_inicial)} ${i.unidad_medida}`}</td>
                {!dinero && <td className="num">{i.fecha_vencimiento ? fecha(i.fecha_vencimiento) : '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mini" style={{ marginTop: 12 }}>Gracias por sumar. Este comprobante se generó con el sistema de gestión de donaciones.</p>
      </div>

      <div className="dos no-imprimir">
        <button type="button" className="boton secundario" onClick={() => navegar(-1)}>Volver</button>
        <button type="button" className="boton" onClick={() => window.print()}>Imprimir o guardar</button>
      </div>
    </div>
  );
}
