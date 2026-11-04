# Frontend · Gestión de donaciones

Aplicación web de Suma de Voluntades, hecha con React y Vite. Se usa desde el celular o la computadora y se puede instalar como aplicación (PWA).

## Puesta en marcha

Necesita el backend funcionando (ver el README de la raíz del repositorio).

```bash
npm install
cp .env.example .env   # opcional: VITE_API_URL, por defecto http://localhost:3000
npm run dev            # http://localhost:5173
```

Otros comandos:

| Comando | Para qué |
|---|---|
| `npm run build` | Arma la versión para publicar en `dist/` |
| `npm run preview` | Sirve `dist/` para probarla (incluye el modo instalable) |
| `npm run lint` | Revisa el código |

## Estructura

| Archivo o carpeta | Qué tiene |
|---|---|
| `src/api.js` | Llamadas a la API, con el token de la sesión |
| `src/sesion.jsx` | Inicio y cierre de sesión |
| `src/permisos.js` | Qué pantallas y acciones ve cada perfil |
| `src/formato.js` | Números y fechas en formato argentino |
| `src/catalogo.js` | Categorías y unidades de los productos |
| `src/componentes/Estructura.jsx` | Encabezado, navegación por perfil y aviso de pantalla no disponible |
| `src/pantallas/` | Inicio de sesión, Inicio, Ingreso, Depósito, Actividades y Gestión |
| `public/manifest.webmanifest`, `public/sw.js` | Lo que permite instalarla en el celular |

## Publicación

- `VITE_API_URL` tiene que apuntar al backend publicado; se toma al hacer `npm run build`.
- Como la navegación se resuelve en el navegador, el servidor tiene que devolver `index.html` para cualquier ruta (por ejemplo `/deposito`). En Render, como sitio estático, se configura con una regla *rewrite* de `/*` a `/index.html`.
- El modo instalable solo se activa en la versión publicada y con HTTPS (o en `localhost`).
