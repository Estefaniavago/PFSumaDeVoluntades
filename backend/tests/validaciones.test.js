const { leerNumero, leerId, validarIngreso } = require('../src/validaciones');

describe('leerNumero: valida cantidades antes de guardarlas (RF-11)', () => {
  test('acepta números y textos numéricos', () => {
    expect(leerNumero(20, 'Cantidad')).toEqual({ valor: 20 });
    expect(leerNumero('2.5', 'Cantidad')).toEqual({ valor: 2.5 });
  });

  test('rechaza lo que no es un número, que antes se guardaba como NaN', () => {
    for (const malo of ['diez', '', '   ', 'NaN', NaN, Infinity, null, undefined, {}, [], true]) {
      expect(leerNumero(malo, 'Cantidad').error).toBe('Cantidad: tiene que ser un número.');
    }
  });

  test('rechaza cero y negativos, salvo que se permitan', () => {
    expect(leerNumero(0, 'Cantidad').error).toMatch(/no puede ser cero/);
    expect(leerNumero(-3, 'Cantidad').error).toMatch(/mayor que cero/);
    expect(leerNumero(0, 'Mínimo', { permitirCero: true })).toEqual({ valor: 0 });
    expect(leerNumero(-3, 'Ajuste', { permitirNegativo: true })).toEqual({ valor: -3 });
  });

  test('rechaza valores desproporcionados', () => {
    expect(leerNumero(100001, 'Cantidad').error).toMatch(/demasiado grande/);
    expect(leerNumero(-100001, 'Ajuste', { permitirNegativo: true }).error).toMatch(/demasiado grande/);
  });

  test('exige entero cuando corresponde', () => {
    expect(leerNumero(12.5, 'Porciones', { entero: true }).error).toMatch(/entero/);
    expect(leerNumero('400', 'Porciones', { entero: true })).toEqual({ valor: 400 });
  });
});

describe('leerId: identificadores enteros positivos', () => {
  test('acepta ids válidos y rechaza el resto', () => {
    expect(leerId(7, 'Lote')).toEqual({ valor: 7 });
    expect(leerId('7', 'Lote')).toEqual({ valor: 7 });
    expect(leerId('abc', 'Lote').error).toBeDefined();
    expect(leerId(0, 'Lote').error).toBeDefined();
    expect(leerId(1.5, 'Lote').error).toBeDefined();
  });
});

describe('validarIngreso: datos de una donación', () => {
  test('una donación válida no tiene errores', () => {
    expect(validarIngreso({ items: [{ id_producto: 1, cantidad: 20 }] })).toEqual([]);
  });

  test('pide al menos un producto', () => {
    expect(validarIngreso({ items: [] })).toEqual(['Cargá al menos un producto.']);
  });

  test('rechaza cantidades inválidas y productos vencidos', () => {
    const errores = validarIngreso({
      items: [
        { id_producto: 1, cantidad: 'diez' },
        { id_producto: 2, cantidad: 5, fecha_vencimiento: '2000-01-01' },
      ],
    });
    expect(errores).toEqual([
      'Ítem 1: la cantidad debe ser mayor que cero.',
      'Ítem 2: ese producto ya está vencido.',
    ]);
  });
});
