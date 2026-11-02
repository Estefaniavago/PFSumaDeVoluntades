# Sistema de gestión de donaciones · Suma de Voluntades

Aplicación web para que la Asociación Civil Suma de Voluntades (Paraná, Entre Ríos) registre las
donaciones que recibe, consulte el stock del depósito y calcule los insumos que necesita cada
actividad. Reemplaza el cuaderno de papel con el que hoy se lleva el inventario.

Proyecto Integrador · Práctica Profesionalizante IV · IFTS N.º 29 · Pool Tech.

## Equipo

| Integrante | Rol |
|---|---|
| Estefanía Vago | Coordinación del proyecto y desarrollo frontend |
| Sofía Trucco | Análisis funcional |
| Diego Moreno Rico | Desarrollo backend y diseño del sistema |
| Guillermo Benítez | Testing |

## Tecnologías

| Capa | Tecnología |
|---|---|
| Backend | Node.js con Express 5, API REST |
| Base de datos | PostgreSQL |
| Autenticación | JWT y contraseñas cifradas con bcrypt |
| Pruebas | Jest y Supertest |

## Requisitos

- Node.js 20 o superior (probado con la versión 22).
- PostgreSQL 14 o superior (probado con la versión 17), instalado y en ejecución.
- Git.

## Instalación y puesta en marcha

1. Clonar el repositorio:

   ```bash
   git clone https://github.com/Estefaniavago/PFSumaDeVoluntades.git
   cd PFSumaDeVoluntades/backend
   ```

2. Instalar las dependencias:

   ```bash
   npm install
   ```

3. Configurar las variables de entorno. Copiar `backend/.env.example` como `backend/.env` y
   completar la contraseña del usuario de PostgreSQL en `DATABASE_URL`. El archivo `.env` no se
   sube al repositorio.

   | Variable | Para qué sirve |
   |---|---|
   | `DATABASE_URL` | Conexión a PostgreSQL: `postgresql://USUARIO:CONTRASEÑA@HOST:PUERTO/BASE` |
   | `JWT_SECRET` | Clave para firmar las sesiones. Usar una cadena larga y aleatoria |
   | `PORT` | Puerto del servidor (por defecto, 3000) |

   Si la contraseña tiene caracteres como `@`, `#`, `/` o `:`, hay que codificarlos dentro de la
   dirección (por ejemplo, `@` se escribe `%40`).

4. Crear la base de datos con sus tablas, los datos base y los usuarios de prueba:

   ```bash
   npm run db:reset
   ```

   Si la base indicada en `DATABASE_URL` no existe, el comando la crea.

5. Iniciar el servidor:

   ```bash
   npm run dev
   ```

   La API queda disponible en `http://localhost:3000`.

### Comandos disponibles

| Comando | Qué hace |
|---|---|
| `npm run dev` | Inicia el servidor y lo reinicia ante cada cambio |
| `npm start` | Inicia el servidor |
| `npm run db:reset` | **Borra** y vuelve a crear las tablas, y carga los datos base y los usuarios de prueba |
| `npm run db:seed` | Carga los datos base y los usuarios de prueba sin borrar nada. Se puede repetir sin duplicar |
| `npm test` | Ejecuta las pruebas |

`npm run db:reset` elimina todos los datos. Usarlo solo en una base de desarrollo, nunca en la base
de la aplicación publicada.

## Usuarios de prueba

Todos usan la contraseña `Prueba123!`. Son solo para desarrollo y no deben cargarse en la versión
publicada.

| Perfil | Email |
|---|---|
| Referente de puerta | puerta@pooltech.test |
| Encargado de depósito | deposito@pooltech.test |
| Coordinador de actividad | coordinador@pooltech.test |
| Dirección | direccion@pooltech.test |

## Datos base

`database/seed.sql` carga los cuatro roles, un catálogo de productos de ejemplo, dos destinos para
derivaciones y los menús de invierno y verano con sus insumos por porción. Los mínimos de stock y
las cantidades por porción son valores de ejemplo: se guardan en la base y en el uso real los
define la dirección.

## API

Todas las rutas, salvo el inicio de sesión, requieren el encabezado
`Authorization: Bearer <token>`. El control de perfiles se hace en el servidor; la dirección tiene
acceso a todo.

| Método y ruta | Qué hace | Perfiles |
|---|---|---|
| **Sesión** | | |
| `POST /login` | Inicia sesión y devuelve el token | Todos |
| **Catálogo** | | |
| `GET /productos` | Catálogo de productos activos | Todos |
| `POST /productos` | Alta de un producto. Si lo crea el referente de puerta, el mínimo queda en 0 y lo completa la dirección (RF-03) | Referente de puerta, encargado de depósito |
| `PUT /productos/:id` | Edita un producto (nombre, categoría, unidad, mínimo, perecedero, activo) | Encargado de depósito |
| `DELETE /productos/:id` | Baja lógica: el producto queda inactivo | Encargado de depósito |
| **Inventario** | | |
| `POST /donaciones` | Registra una donación: genera el remito, un lote por producto y el movimiento de ingreso | Referente de puerta, encargado de depósito |
| `POST /aportes` | Registra un aporte monetario como donación | Referente de puerta, encargado de depósito |
| `GET /stock` | Stock por producto y detalle de lotes con vencimiento | Encargado de depósito, coordinador de actividad |
| `POST /salidas` | Salida de mercadería de un lote, opcionalmente para una actividad | Encargado de depósito |
| `GET /derivaciones/destinos` | Comedores y organizaciones a los que se deriva | Todos |
| `POST /derivaciones/destinos` | Alta de un destino | Encargado de depósito |
| `POST /derivaciones` | Deriva mercadería de un lote a un destino, con motivo | Encargado de depósito |
| `POST /bajas` | Baja por vencimiento o descarte, con motivo | Encargado de depósito |
| `POST /ajustes` | Corrección de stock (positiva o negativa), con motivo | Encargado de depósito |
| `GET /movimientos` | Historial; filtros por `id_producto`, `tipo_movimiento`, `id_usuario`, `id_actividad`, `fecha_desde`, `fecha_hasta` | Encargado de depósito, coordinador de actividad |
| `GET /alertas` | Productos bajo el mínimo y lotes que vencen en 7 días o menos | Encargado de depósito, coordinador de actividad |
| **Presupuesto por actividad** | | |
| `GET /menus` | Menús con sus insumos por porción | Todos |
| `POST /menus` | Crea un menú con sus insumos | Dirección |
| `DELETE /menus/:id` | Elimina un menú que no tenga actividades | Dirección |
| `GET /actividades` | Actividades planificadas, realizadas y canceladas | Todos |
| `POST /actividades` | Crea una actividad con tipo, fecha, menú y porciones | Coordinador de actividad |
| `PUT /actividades/:id/cancelar` | Cancela una actividad | Coordinador de actividad |
| `GET /actividades/:id/presupuesto` | Insumos necesarios, stock disponible y faltantes | Coordinador de actividad, encargado de depósito |
| `POST /actividades/:id/reservar` | Reserva los insumos y genera pedidos de reposición por lo que falta | Coordinador de actividad |
| **Usuarios** | | |
| `GET /usuarios`, `POST /usuarios` | Lista y crea usuarios | Dirección |
| `PUT /usuarios/:id`, `DELETE /usuarios/:id` | Edita y desactiva usuarios | Dirección |

La dirección puede usar todas las rutas, aunque no figure en la columna de perfiles.

En `salidas`, `derivaciones`, `bajas` y `ajustes`, la cantidad tiene que ser un número; si no, la
respuesta es 400. Las cantidades que restan stock se guardan como movimientos negativos, y el stock
es la suma de los movimientos.

Ejemplo de cuerpo para `POST /donaciones`:

```json
{
  "donante_nombre": "Panadería del barrio",
  "anonima": false,
  "items": [
    { "id_producto": 1, "cantidad": 20, "fecha_vencimiento": "2026-12-31" }
  ]
}
```

Los errores se devuelven como `{ "error": "mensaje" }`, con un texto que indica qué corregir.

## Estructura del proyecto

```
backend/
  scripts/
    db-setup.js        Prepara la base (db:reset y db:seed)
    seed-usuarios.js   Crea los usuarios de prueba
  src/
    app.js             Configuración de Express y rutas
    server.js          Arranque del servidor
    db.js              Conexión a PostgreSQL
    validaciones.js    Validación de los datos de entrada
    middleware/
      auth.js          Verificación de la sesión y de los perfiles
    routes/            Una ruta por módulo: auth, donaciones, aportes, productos, stock,
                       salidas, derivaciones, bajas, ajustes, movimientos, alertas, menus,
                       actividades, presupuestos y usuarios
    lotes.js           Bloqueo y cierre de lotes en salidas, derivaciones, bajas y ajustes
  tests/               Pruebas automáticas (Jest)
  .env.example         Variables de entorno de ejemplo
database/
  schema.sql           Tablas, restricciones y trigger de movimientos inmutables
  seed.sql             Datos base
```

## Reglas del sistema que conviene conocer

- **Los movimientos no se modifican ni se borran.** Un trigger de la base lo impide; las
  correcciones se registran como un movimiento de ajuste.
- **El stock no se guarda: se calcula** sumando los movimientos de cada producto.
- **Cada movimiento registra el usuario y la fecha y hora**, incluidas las donaciones anónimas.

## Forma de trabajo

- Cada integrante trabaja en su propia rama.
- Los cambios llegan a `main` por pull request, revisado por otra persona del equipo.
- Antes de empezar una tarea nueva, traer lo último de `main`.
