-- Pool Tech - Sistema de gestión de donaciones
-- Suma de Voluntades

DROP TABLE IF EXISTS pedidos_reposicion, movimientos, donaciones, remitos,
  actividades, menu_insumos, menus, destinos, productos, usuarios, roles CASCADE;

CREATE TABLE roles (
  id_rol SERIAL PRIMARY KEY,
  nombre_rol VARCHAR(30) UNIQUE NOT NULL
    CHECK (nombre_rol IN ('referente_puerta','coordinador_actividad','encargado_deposito','direccion')),
  descripcion VARCHAR(200)
);

CREATE TABLE usuarios (
  id_usuario SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  email VARCHAR(120) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  id_rol INT NOT NULL REFERENCES roles(id_rol),
  activo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE productos (
  id_producto SERIAL PRIMARY KEY,
  nombre VARCHAR(100) UNIQUE NOT NULL,
  categoria VARCHAR(20) NOT NULL
    CHECK (categoria IN ('alimento','limpieza','mobiliario','ropa','descartable','dinero')),
  unidad_medida VARCHAR(10) NOT NULL,
  minimo_deseable NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (minimo_deseable >= 0),
  perecedero BOOLEAN NOT NULL DEFAULT FALSE,
  activo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE remitos (
  id_remito SERIAL PRIMARY KEY,
  nro_remito VARCHAR(20) UNIQUE NOT NULL,
  fecha_hora_ingreso TIMESTAMP NOT NULL DEFAULT NOW(),
  id_usuario INT NOT NULL REFERENCES usuarios(id_usuario),
  donante_nombre VARCHAR(120),
  anonima BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE menus (
  id_menu SERIAL PRIMARY KEY,
  nombre_menu VARCHAR(100) NOT NULL,
  temporada VARCHAR(10) NOT NULL CHECK (temporada IN ('invierno','verano')),
  rendimiento_porciones INT NOT NULL DEFAULT 100 CHECK (rendimiento_porciones > 0)
);

CREATE TABLE menu_insumos (
  id_menu_insumo SERIAL PRIMARY KEY,
  id_menu INT NOT NULL REFERENCES menus(id_menu) ON DELETE CASCADE,
  id_producto INT NOT NULL REFERENCES productos(id_producto),
  cantidad_por_porcion NUMERIC(10,4) NOT NULL CHECK (cantidad_por_porcion > 0),
  UNIQUE (id_menu, id_producto)
);

CREATE TABLE actividades (
  id_actividad SERIAL PRIMARY KEY,
  id_menu INT REFERENCES menus(id_menu),
  id_coordinador INT NOT NULL REFERENCES usuarios(id_usuario),
  tipo_actividad VARCHAR(20) NOT NULL
    CHECK (tipo_actividad IN ('desayuno','merienda','cena','salida_barrios','ropero','evento')),
  fecha_hora_salida TIMESTAMP NOT NULL,
  porciones_estimadas INT NOT NULL CHECK (porciones_estimadas > 0),
  porciones_reales INT CHECK (porciones_reales >= 0),
  estado VARCHAR(15) NOT NULL DEFAULT 'planificada'
    CHECK (estado IN ('planificada','realizada','cancelada'))
);

CREATE TABLE destinos (
  id_destino SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  tipo VARCHAR(20) NOT NULL DEFAULT 'comedor' CHECK (tipo IN ('comedor','otra_org'))
);

-- Cada donación representa un lote
CREATE TABLE donaciones (
  id_donacion SERIAL PRIMARY KEY,
  id_producto INT NOT NULL REFERENCES productos(id_producto),
  id_remito INT NOT NULL REFERENCES remitos(id_remito),
  id_actividad_reserva INT REFERENCES actividades(id_actividad),
  cantidad_inicial NUMERIC(10,2) NOT NULL CHECK (cantidad_inicial > 0),
  fecha_vencimiento DATE,
  estado VARCHAR(20) NOT NULL DEFAULT 'recibida'
    CHECK (estado IN ('recibida','disponible','proxima_a_vencer','reservada',
                      'entregada','derivada','vencida_descartada'))
);

-- Inmutable: nunca se edita ni se borra (RNF-07)
CREATE TABLE movimientos (
  id_movimiento SERIAL PRIMARY KEY,
  id_donacion INT NOT NULL REFERENCES donaciones(id_donacion),
  id_usuario INT NOT NULL REFERENCES usuarios(id_usuario),
  id_actividad INT REFERENCES actividades(id_actividad),
  id_destino INT REFERENCES destinos(id_destino),
  tipo_movimiento VARCHAR(15) NOT NULL
    CHECK (tipo_movimiento IN ('ingreso','salida','derivacion','baja','ajuste')),
  cantidad NUMERIC(10,2) NOT NULL,   -- en ajustes puede ser negativa
  motivo VARCHAR(200),
  fecha_hora TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE pedidos_reposicion (
  id_pedido SERIAL PRIMARY KEY,
  id_actividad INT NOT NULL REFERENCES actividades(id_actividad),
  id_producto INT NOT NULL REFERENCES productos(id_producto),
  id_usuario INT NOT NULL REFERENCES usuarios(id_usuario),
  cantidad_faltante NUMERIC(10,2) NOT NULL CHECK (cantidad_faltante > 0),
  estado VARCHAR(15) NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','gestionado','recibido')),
  fecha_hora TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Refuerzo de RNF-07 a nivel base de datos: bloquea UPDATE y DELETE
CREATE OR REPLACE FUNCTION bloquear_modificacion_movimientos() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Los movimientos no pueden modificarse ni eliminarse. Registre un ajuste.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_movimientos_inmutables
BEFORE UPDATE OR DELETE ON movimientos
FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_movimientos();