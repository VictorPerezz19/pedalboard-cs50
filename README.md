# Virtual Pedalboard & Tone Tracker
#### Video Demo: https://youtu.be/bTfshpSaKzI
#### Description:

**Virtual Pedalboard & Tone Tracker** es una aplicación web para guitarristas. Permite diseñar una pedalera virtual arrastrando amplificadores y pedales a una cadena de señal, ajustar las perillas de cada pieza (del 1 al 10), guardar la configuración con un nombre y una descripción, y explorar presets de ejemplo que aproximan el sonido de bandas famosas como Nirvana, Red Hot Chili Peppers o The Beatles.

La idea nació de un problema real: cuando consigues un tono que te gusta, apuntar a mano "Dist 8, Tone 5, Level 7" en una libreta se pierde enseguida, y además no refleja el orden de los pedales, que cambia mucho el sonido. Con esta aplicación la cadena, el orden y los valores de cada perilla quedan guardados y se pueden recuperar, duplicar y modificar.

El proyecto sigue una arquitectura MVC sencilla: Flask hace de controlador, SQLite (a través de `cs50.SQL`) es el modelo, y las plantillas Jinja2 más un archivo de JavaScript puro forman la vista. Usa Bootstrap 5 para la maquetación responsive y un tema oscuro propio inspirado en el equipo de música.

## Funcionalidades

- **Registro e inicio de sesión** con contraseñas almacenadas como hash (`generate_password_hash` / `check_password_hash` de Werkzeug) y sesiones en el sistema de archivos con Flask-Session.
- **Builder**: inventario lateral cargado desde la API, zona de caída (dropzone) para montar la pedalera, reordenación por arrastre, modal para ajustar las perillas y guardado del preset.
- **Mis presets** (`/`): dashboard con tarjetas de los presets del usuario, con opciones para duplicar/editar y eliminar.
- **Explore**: galería pública de presets predeterminados que cualquiera puede abrir en el Builder con «Probar este tono».

## Archivos del proyecto

### Backend

- **`app.py`**: controlador principal. Contiene las rutas `/register`, `/login`, `/logout`, `/` (presets del usuario), `/explore`, `/api/gear` (catálogo en JSON), `/builder` (GET para ver la interfaz y POST para guardar) y `/delete`. Aquí también está la validación del servidor: comprueba que el JSON recibido tenga el formato esperado, que el nombre exista y no sea excesivo, que cada `gear_id` exista en el catálogo y que cada perilla sea un entero entre 1 y 10. Además define el filtro Jinja `from_json` y la función `attach_items`, que añade a cada preset sus piezas ordenadas.
- **`helpers.py`**: el decorador `@login_required`, que redirige a `/login` si no hay sesión, y la función `apology(message, code)`, que renderiza una página de error.
- **`schema.sql`**: crea las tablas `users`, `gear_catalog`, `presets` y `preset_items`, con sus índices, e inserta el catálogo de ejemplo (Blackstar Debut 50R, Boss DS-2, Mooer Pure Boost y Behringer UC200) y los tres presets predeterminados.
- **`requirements.txt`**: dependencias de Python.
- **`pedalboard.db`**: la base de datos SQLite que se genera a partir de `schema.sql`.

### Plantillas (`templates/`)

- **`layout.html`**: plantilla base con la barra de navegación responsive de Bootstrap, los mensajes `flash` y los bloques que heredan las demás vistas. Los enlaces cambian según haya sesión o no.
- **`login.html`** y **`register.html`**: formularios centrados y sencillos.
- **`index.html`**: dashboard del usuario.
- **`explore.html`**: galería de presets predeterminados.
- **`builder.html`**: la vista principal, con el panel de inventario, los campos de nombre y descripción, la dropzone y el modal de perillas. Recibe el preset a precargar mediante `tojson`.
- **`apology.html`**: página de error usada por `apology()`.
- **`_chain.html`**: parcial reutilizado por `index.html` y `explore.html` para mostrar la cadena de un preset sin duplicar código.

### Frontend estático (`static/`)

- **`styles.css`**: tema oscuro y estilos propios para pedales, amplificadores, perillas, la dropzone y el modal. Las perillas son simples `div` cuyo giro se controla con una variable CSS (`--angle`), y el color de cada pedal se genera a partir de su nombre.
- **`script.js`**: toda la lógica del Builder. Carga el catálogo con `fetch("/api/gear")`, implementa el drag & drop con la API nativa de HTML5, redibuja la pedalera a partir de un array de estado, abre el modal de ajustes al hacer clic en una pieza y envía el preset con `savePreset()` mediante un `POST` con `Content-Type: application/json` a `/builder`.

## Decisiones de diseño

**Presets predeterminados con `user_id NULL`.** Para los presets de Explore podría haber añadido una columna `is_public` o una tabla aparte. Opté por permitir que `presets.user_id` sea `NULL`: así el esquema se mantiene en las cuatro tablas pedidas, y la consulta de Explore es simplemente `WHERE user_id IS NULL`. Los presets de cada usuario son privados.

**`settings` como JSON en texto.** Cada pieza guarda sus perillas como un objeto JSON (por ejemplo `{"Level":7,"Tone":5,"Dist":8}`). Es flexible, porque cada pedal tiene perillas distintas, y evita crear una tabla por perilla. El filtro `from_json` también tolera texto plano antiguo.

**El servidor no se fía del cliente.** La posición de cada pieza se recalcula en el servidor según el orden del array recibido, aunque el cliente la envíe. Los valores se validan de nuevo aunque el frontend ya los limite, porque cualquiera puede enviar un `POST` a mano. Si falla la inserción de alguna pieza, se elimina el preset a medias para no dejar datos inconsistentes.

**Estado en JavaScript y render completo.** El Builder mantiene un array `board` como única fuente de verdad y vuelve a dibujar la dropzone tras cada cambio. Es más sencillo y menos propenso a errores que manipular el DOM pieza a pieza, y con un máximo de 12 piezas el coste es insignificante. Cada instancia tiene un `uid`, lo que permite repetir el mismo pedal en la cadena.

**Seguridad en el DOM.** Los elementos se construyen con `createElement` y `textContent` en lugar de `innerHTML`, para evitar inyección de HTML con datos procedentes del servidor.

**Drag & drop y pantallas táctiles.** El drag & drop nativo de HTML5 es poco fiable en móviles, así que cada pieza del inventario incluye un botón «+» como alternativa. Elegí la API nativa en lugar de una librería para cumplir el requisito de JavaScript puro, aunque obliga a calcular manualmente el hueco de la cadena donde se suelta una pieza.

**Duplicar en lugar de editar en sitio.** `/builder?from=ID` carga un preset (propio o de Explore) en el Builder, y al guardar siempre se crea uno nuevo. Esto evita sobrescribir por accidente un preset existente y hace natural partir de un tono famoso para crear el propio.

## Limitaciones

Los presets de Explore son aproximaciones orientativas con el equipo del catálogo, no reproducciones exactas de los tonos reales. La aplicación no emite sonido: es una herramienta de diseño y registro de configuraciones. Como mejora futura se podrían añadir más equipos al catálogo, edición de presets existentes, presets públicos creados por los usuarios o imágenes reales de cada pieza.

## Cómo ejecutarlo

```bash
pip install -r requirements.txt
sqlite3 pedalboard.db < schema.sql
flask run
```

Después, abre la dirección que indique Flask, crea una cuenta y empieza a montar tu pedalera.
