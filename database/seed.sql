-- Pool Tech - Sistema de gestión de donaciones
-- Datos base: roles, catálogo de productos, destinos y menús.
-- Se puede ejecutar más de una vez: no duplica registros.
-- Los productos, mínimos y rendimientos son valores de ejemplo; en el uso real los define la dirección.

-- Roles (los cuatro perfiles de la tabla de permisos)
INSERT INTO roles (nombre_rol, descripcion) VALUES
  ('referente_puerta',      'Registra el ingreso de las donaciones. No consulta el stock.'),
  ('encargado_deposito',    'Registra ingresos y salidas de mercadería y consulta el stock.'),
  ('coordinador_actividad', 'Arma las actividades, consulta el stock y pide reposición.'),
  ('direccion',             'Accede a todas las funciones; define menús y presupuestos.')
ON CONFLICT (nombre_rol) DO NOTHING;

-- Catálogo de productos
INSERT INTO productos (nombre, categoria, unidad_medida, minimo_deseable, perecedero) VALUES
  ('Arroz',                 'alimento',    'kg',       40,  FALSE),
  ('Fideos',                'alimento',    'kg',       30,  FALSE),
  ('Aceite',                'alimento',    'litros',   10,  FALSE),
  ('Puré de tomate',        'alimento',    'unidades', 12,  TRUE),
  ('Sal',                   'alimento',    'kg',       5,   FALSE),
  ('Leche larga vida',      'alimento',    'litros',   20,  TRUE),
  ('Carne molida de pollo', 'alimento',    'kg',       60,  TRUE),
  ('Bandejas descartables', 'descartable', 'unidades', 500, FALSE),
  ('Lavandina',             'limpieza',    'litros',   5,   FALSE),
  ('Ropa y calzado',        'ropa',        'unidades', 0,   FALSE),
  ('Aporte monetario',      'dinero',      'pesos',    0,   FALSE)
ON CONFLICT (nombre) DO NOTHING;

-- Destinos para derivar excedentes
INSERT INTO destinos (nombre, tipo)
SELECT d.nombre, d.tipo
FROM (VALUES
  ('Comedor comunitario de ejemplo', 'comedor'),
  ('Merendero de ejemplo',           'otra_org')
) AS d(nombre, tipo)
WHERE NOT EXISTS (SELECT 1 FROM destinos x WHERE x.nombre = d.nombre);

-- Menús fijos: uno de invierno y uno de verano
INSERT INTO menus (nombre_menu, temporada, rendimiento_porciones)
SELECT m.nombre, m.temporada, 100
FROM (VALUES
  ('Guiso de invierno', 'invierno'),
  ('Fideos con salsa',  'verano')
) AS m(nombre, temporada)
WHERE NOT EXISTS (SELECT 1 FROM menus x WHERE x.nombre_menu = m.nombre);

-- Insumos por porción. Las bandejas son 0,9 por porción porque hay gente que trae su táper.
INSERT INTO menu_insumos (id_menu, id_producto, cantidad_por_porcion)
SELECT me.id_menu, p.id_producto, i.cantidad
FROM (VALUES
  ('Guiso de invierno', 'Arroz',                 0.064),
  ('Guiso de invierno', 'Puré de tomate',        0.022),
  ('Guiso de invierno', 'Sal',                   0.0055),
  ('Guiso de invierno', 'Aceite',                0.009),
  ('Guiso de invierno', 'Bandejas descartables', 0.9),
  ('Fideos con salsa',  'Fideos',                0.08),
  ('Fideos con salsa',  'Puré de tomate',        0.025),
  ('Fideos con salsa',  'Sal',                   0.005),
  ('Fideos con salsa',  'Aceite',                0.008),
  ('Fideos con salsa',  'Bandejas descartables', 0.9)
) AS i(menu, producto, cantidad)
JOIN menus me ON me.nombre_menu = i.menu
JOIN productos p ON p.nombre = i.producto
ON CONFLICT (id_menu, id_producto) DO NOTHING;
