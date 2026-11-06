// Pruebas unitarias del cálculo de insumos y faltantes (RF-17, RF-18, RF-19).
// Es el problema que planteó Suma de Voluntades: saber antes de la salida si alcanza, por ejemplo, el aceite.
// calcularPresupuesto recibe la base como parámetro, así que se le pasa una base simulada con
// datos fijos: se prueba solo la lógica del cálculo, sin PostgreSQL.
const { calcularPresupuesto } = require('../src/routes/presupuestos');
const { ErrorNegocio } = require('../src/lotes');

// Base simulada: responde según la tabla que consulta cada SQL.
// Los saldos llegan como texto, igual que devuelve PostgreSQL los SUM de columnas numéricas.
function baseSimulada({ actividad, insumos = [], lotesPorProducto = {} }) {
  return {
    async query(sql, params) {
      if (sql.includes('FROM actividades')) return { rows: actividad ? [actividad] : [] };
      if (sql.includes('FROM menu_insumos')) return { rows: insumos };
      if (sql.includes('FROM donaciones')) return { rows: lotesPorProducto[params[0]] || [] };
      throw new Error(`Consulta no prevista en la prueba: ${sql}`);
    },
  };
}

const cenaDeInvierno = {
  actividad: { id_actividad: 1, porciones_estimadas: 400, id_menu: 1, estado: 'planificada' },
  insumos: [
    { id_producto: 10, nombre: 'Aceite', unidad_medida: 'litro', cantidad_por_porcion: 0.1 },
    { id_producto: 20, nombre: 'Arroz', unidad_medida: 'kg', cantidad_por_porcion: 0.15 },
  ],
  lotesPorProducto: {
    10: [
      { id_donacion: 5, fecha_vencimiento: '2026-12-01', stock_disponible: '10.5' },
      { id_donacion: 8, fecha_vencimiento: null, stock_disponible: '19.5' },
    ],
    20: [{ id_donacion: 9, fecha_vencimiento: '2027-03-01', stock_disponible: '100' }],
  },
};

describe('calcularPresupuesto: insumos necesarios contra el stock', () => {
  test('detecta el faltante cuando el stock no alcanza (el caso del aceite)', async () => {
    const { insumos } = await calcularPresupuesto(baseSimulada(cenaDeInvierno), 1);
    const aceite = insumos.find(i => i.nombre === 'Aceite');

    // 400 porciones x 0,1 litro = 40 litros; hay 10,5 + 19,5 = 30 litros en dos lotes.
    expect(aceite.cantidad_necesaria).toBe(40);
    expect(aceite.stock_disponible).toBe(30);
    expect(aceite.faltante).toBe(10);
    expect(aceite.lotes_disponibles).toHaveLength(2);
  });

  test('no informa faltante cuando el stock alcanza', async () => {
    const { insumos } = await calcularPresupuesto(baseSimulada(cenaDeInvierno), 1);
    const arroz = insumos.find(i => i.nombre === 'Arroz');

    // 400 x 0,15 kg = 60 kg; hay 100 kg. El faltante nunca es negativo.
    expect(arroz).toMatchObject({ cantidad_necesaria: 60, stock_disponible: 100, faltante: 0 });
  });

  test('sin lotes disponibles, falta todo lo necesario', async () => {
    const base = baseSimulada({ ...cenaDeInvierno, lotesPorProducto: {} });
    const { insumos } = await calcularPresupuesto(base, 1);
    expect(insumos.map(i => i.faltante)).toEqual([40, 60]);
  });

  test('redondea a dos decimales y evita errores de coma flotante', async () => {
    const base = baseSimulada({
      actividad: { id_actividad: 2, porciones_estimadas: 3, id_menu: 2, estado: 'planificada' },
      insumos: [{ id_producto: 30, nombre: 'Sal', unidad_medida: 'kg', cantidad_por_porcion: 0.1 }],
    });
    const { insumos: [sal] } = await calcularPresupuesto(base, 2);
    // En JavaScript 3 x 0.1 da 0.30000000000000004.
    expect(sal.cantidad_necesaria).toBe(0.3);
  });

  test('avisa si la actividad no existe (404) o no tiene menú', async () => {
    await expect(calcularPresupuesto(baseSimulada({ actividad: null }), 99))
      .rejects.toMatchObject({ message: 'Actividad no encontrada.', status: 404 });

    const sinMenu = baseSimulada({ actividad: { id_actividad: 3, porciones_estimadas: 50, id_menu: null } });
    const error = await calcularPresupuesto(sinMenu, 3).catch(e => e);
    expect(error).toBeInstanceOf(ErrorNegocio);
    expect(error).toMatchObject({ message: 'La actividad no tiene un menú asignado.', status: 400 });
  });
});
