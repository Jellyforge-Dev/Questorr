<div align="center">
  <img src="./assets/logo-transparent.png" alt="Questorr Logo" width="160"/>

  # Questorr

  **Un bot de Discord autoalojado que conecta Jellyfin y Seerr — con notificaciones inteligentes, enrutamiento automático de canales y un panel web completo.**

  [![Version](https://img.shields.io/badge/version-2.4.4-brightgreen)](https://github.com/Jellyforge-Dev/Questorr/releases)
  [![Docker](https://img.shields.io/badge/Docker-jellyforge%2Fquestorr-blue?logo=docker)](https://hub.docker.com/r/jellyforge/questorr)
  [![License](https://img.shields.io/badge/License-AGPL--3.0-blue)](LICENSE)
  [![Discord](https://img.shields.io/badge/Discord-Unirse-5865F2?logo=discord&logoColor=white)](https://discord.gg/rXANrXJqVf)

  [🇬🇧 English](README.md) &nbsp;|&nbsp; [🇩🇪 Deutsch](README.de.md) &nbsp;|&nbsp; [🇫🇷 Français](README.fr.md) &nbsp;|&nbsp; [🇪🇸 Español](README.es.md) &nbsp;|&nbsp; [🇧🇷 Português (Brasil)](README.pt_br.md) &nbsp;|&nbsp; [🇸🇪 Svenska](README.sv.md)

  [💬 Comunidad de Discord](https://discord.gg/rXANrXJqVf) &nbsp;|&nbsp; [<img src="https://storage.ko-fi.com/cdn/cup-border.png" height="14" alt="Ko-fi"> Invítame un café](https://ko-fi.com/jellyforgedev) &nbsp;|&nbsp; [🐛 Reportar un error](https://github.com/Jellyforge-Dev/Questorr/issues)

</div>

---

> **📸 Aviso sobre las capturas:** Todas las capturas de pantalla de este README se tomaron en un entorno de demostración y no muestran datos reales de usuarios. La versión en vivo puede verse ligeramente distinta y mostrar más contenido según tu configuración.

<div align="center">
  <table>
    <tr>
      <td align="center" width="50%"><code>/search</code> — buscar y solicitar un título</td>
      <td align="center" width="50%">Una notificación de "ya disponible", enrutada automáticamente al canal correcto</td>
    </tr>
    <tr>
      <td><img src="assets/discord/search-example.png" alt="Ejemplo del comando /search" width="100%"/></td>
      <td><img src="assets/discord/notification-example.png" alt="Ejemplo de notificación de biblioteca" width="100%"/></td>
    </tr>
  </table>
</div>

---

## ✨ Funciones

| Función | Descripción |
|---|---|
| 🔍 `/search` | Busca películas y series, solicítalas directamente desde el embed |
| 📤 `/request` | Solicitudes de contenido instantáneas con selección opcional de etiqueta, servidor y calidad |
| 🔥 `/trending` | Explora las películas y series en tendencia semanal |
| 🔎 `/status` | Consulta el estado de la solicitud en Seerr de cualquier título — con póster, sinopsis, género, duración, valoración y clasificación por edad. Muestra un botón de Solicitar si aún no se ha pedido |
| 🎲 `/random` | Obtén una película o serie aleatoria de tu biblioteca de Jellyfin — con póster, sinopsis, género, duración y valoración. Solo visible para quien ejecuta el comando |
| 🐛 `/report` | Reporta un problema (vídeo / audio / subtítulo) de un título de Jellyfin (`/report movie` · `/report series`). Abre un issue en Seerr; los administradores comentan y resuelven directamente desde Discord, y quien reporta recibe DMs |
| 💡 `/recommend` | Obtén recomendaciones basadas en una película o serie a través de TMDB |
| 🧭 `/discover` | Descubre contenido por género, año y valoración mínima |
| 📦 `/collection` | Consulta todas las películas de una franquicia/colección junto con su disponibilidad |
| 🎭 `/cast` | Explora la filmografía completa de un actor con paginación |
| 🔗 `/similar` | Encuentra títulos similares basados en género y palabras clave |
| 📥 `/queue` | Sigue el estado de **tus propias** solicitudes — agrupadas por fase (en espera, descargando, disponible, rechazada, fallida) |
| 🔔 `/subscribe` | Suscríbete a una serie para recibir un DM cuando salga una nueva temporada, más una **DM de recomendación semanal personalizada** opcional |
| ✨ `/foryou` | Recomendaciones personalizadas basadas en tu historial de visualización en Jellyfin |
| 🔖 `/watchlist` | Consulta las solicitudes de contenido recientes de Seerr |
| 🕘 `/history` | Consulta las películas y series añadidas recientemente a Jellyfin |
| 📅 `/upcoming` | Explora los próximos estrenos de películas y nuevas series de TMDB |
| ❓ `/help` | Muestra todos los comandos disponibles con botones de acción rápida |
| 🆕 Resumen semanal | Publicación semanal opcional de las nuevas películas, series **y episodios** añadidos a tu biblioteca de Jellyfin |
| 🚦 Cuota por usuario | Límite móvil opcional de solicitudes cada 7 días por usuario, con roles de excepción y usuarios ilimitados |
| 🔔 Notificaciones inteligentes | Embeds enriquecidos de Discord para todos los eventos de Seerr (pendiente, aprobada, disponible, rechazada, fallida, incidencias) |
| 📺 Enrutamiento de canales | Las notificaciones se enrutan automáticamente al canal correcto según la carpeta raíz de Radarr/Sonarr |
| 🔕 Eventos privados | Las notificaciones de nueva solicitud y de rechazo se envían directamente al solicitante por DM — no al canal público |
| ✉️ DMs privados | Los usuarios reciben un DM cuando su contenido solicitado se aprueba, se rechaza o queda disponible |
| 🔘 Botones configurables | Elige qué botones (Ver en Seerr, ¡Ver ahora!, Letterboxd, IMDb) aparecen en los embeds de notificación |
| 👤 Vinculación de usuarios | Vincula cuentas de Discord con cuentas de Seerr para que las solicitudes aparezcan del usuario correcto |
| 🔐 Permisos por rol | Controla quién puede usar los comandos del bot mediante listas de permitidos/bloqueados por rol de Discord |
| 🌟 Recomendación diaria | Publica una selección diaria de tu biblioteca existente de Jellyfin |
| 🎲 Selección aleatoria diaria | Publica una sugerencia aleatoria diaria de TMDB |
| 🎨 Colores de embed personalizados | Personaliza los colores de los embeds de resultados de búsqueda y confirmación de éxito |
| ⚙️ Panel web | Configuración completa en `http://tu-servidor:8282` — interfaz estilo Tetris |
| 🎨 Tema oscuro / claro | Retro-oscuro por defecto más un tema claro Paper-Terminal; el interruptor se guarda por navegador |
| 🛡️ Registro de auditoría | Pestaña **Auditoría** del panel: quién aprobó/rechazó una solicitud, cambió la configuración, inició/detuvo el bot o inició sesión |
| 🚨 Alertas de estado | Opcional: publica en un canal de administración cuando Seerr o Jellyfin **cae** o **se recupera** |
| ❤️ Comprobación de salud del contenedor | `HEALTHCHECK` de Docker integrado en `/api/health` — Portainer / Docker / Uptime Kuma ven el contenedor como healthy |
| 📱 Compatible con móviles | Panel responsivo, funciona en smartphones y tablets |
| ✅ Estado de disponibilidad | Todas las listas de embeds muestran el estado en Seerr: ✅ disponible, ⏳ solicitado, 📥 parcial |
| 🎬 Clasificaciones de contenido | Clasificaciones por edad FSK/MPAA en los embeds de búsqueda, configurables por país |
| 📡 Proveedores de streaming | Muestra dónde está disponible un título en streaming (Netflix, Disney+, etc.) |
| ▶️ Botones de tráiler | Enlaces a tráilers de YouTube en los embeds de /search y /request |
| 💚 Barra de estado de salud | Estado de los servicios en tiempo real en el panel |
| 📊 Panel de estadísticas | Estadísticas de uso de comandos con desglose por usuario |
| 🧩 Widget incrustable | Widget HTML para Homarr/Homepage/Organizr con estado y control del bot |
| 🌍 Multilingüe | Panel y bot totalmente traducidos a inglés, alemán, francés, español, portugués de Brasil y sueco |

> 📖 **¿Nuevo por aquí?** La [**Guía completa de uso y configuración**](docs/USAGE.md) (en inglés) explica
> **todos** los comandos, funciones y ajustes en lenguaje sencillo — incluyendo el
> indicador de estado del webhook de Seerr y el error común con la URL de Docker.

---

## 📋 Requisitos previos

- Un servidor de **[Jellyfin](https://jellyfin.org/)** en funcionamiento
- Una instancia de **[Seerr](https://github.com/seerr-team/seerr)** en funcionamiento (conectada a [Radarr](https://github.com/Radarr/Radarr)/[Sonarr](https://github.com/Sonarr/Sonarr))
- Una cuenta de **Discord** con acceso de administrador a un servidor
- **Docker** (recomendado) o Node.js 20+
- Claves de API: [TMDB](https://www.themoviedb.org/settings/api) (obligatoria) · [OMDb](http://www.omdbapi.com/apikey.aspx) (opcional)

---

## 🚀 Inicio rápido

### Docker Compose (recomendado)

**Configuración estándar** — acceso directo por IP y puerto:

```yaml
services:
  questorr:
    image: jellyforge/questorr:latest
    container_name: questorr
    restart: unless-stopped
    environment:
      - WEBHOOK_PORT=8282
      - NODE_ENV=production
    ports:
      - "8282:8282"
    volumes:
      - ./questorr-data:/usr/src/app/config
```

Luego abre `http://tu-servidor-ip:8282` y sigue el asistente de configuración.

**Con un proxy inverso** ([Nginx Proxy Manager](https://github.com/NginxProxyManager/nginx-proxy-manager), [Traefik](https://github.com/traefik/traefik), [Caddy](https://github.com/caddyserver/caddy)) — elimina `ports` y añade la red compartida en su lugar:

```yaml
services:
  questorr:
    image: jellyforge/questorr:latest
    container_name: questorr
    restart: unless-stopped
    environment:
      - WEBHOOK_PORT=8282
      - NODE_ENV=production
    volumes:
      - ./questorr-data:/usr/src/app/config
    networks:
      - proxy             # Debe coincidir con el nombre de red de tu proxy inverso

networks:
  proxy:                  # Debe coincidir con el nombre de red de tu proxy inverso
    external: true
```

Ajustes de reenvío del proxy inverso: Esquema: `http` · Host / hostname de reenvío: `questorr` · Puerto: `8282`

### Etiquetas de Docker

| Etiqueta | Descripción |
|---|---|
| `latest` | Última versión estable |
| `dev` | Build de desarrollo (puede ser inestable) |
| p. ej. `2.4.4` | Versión fija concreta — consulta [Releases](https://github.com/Jellyforge-Dev/Questorr/releases) para ver todas las etiquetas |

### Manual (desarrollo)

```bash
git clone https://github.com/Jellyforge-Dev/Questorr.git
cd Questorr
npm install
node app.js
```

---

## ⚙️ Configuración

### 1. Crear un bot de Discord

1. Ve al [Discord Developer Portal](https://discord.com/developers/applications) → New Application
2. **Bot** → Reset Token para obtener un token, luego activa `Server Members Intent` (necesario para la vinculación de usuarios)
3. **OAuth2** → copia el **Client ID**
4. Pega ambos en el panel de Questorr (Paso 1) y haz clic en **"Invitar bot al servidor"** — el panel construye el enlace de invitación por ti con exactamente los permisos necesarios (`Send Messages`, `Embed Links`, `Pin Messages`), sin necesidad del generador manual de URL de OAuth2

### 2. Configurar mediante el panel web

Abre `http://tu-servidor-ip:8282`, crea una cuenta y completa todos los pasos:

| Paso | Qué configurar |
|---|---|
| 1. Discord | Token del bot, client ID, servidor, canal de notificación por defecto |
| 2. Seerr | URL de Seerr, clave de API, URL del webhook, enrutamiento de canales, asignación de carpetas raíz |
| 3. Bases de datos multimedia | Clave de API de TMDB (obligatoria), clave de API de OMDb (opcional) |
| 4. Jellyfin | URL del servidor, clave de API, ID del servidor, canal de notificación |
| 5. Vinculación de usuarios | Vincula usuarios de Discord con cuentas de Seerr |
| 6. Permisos por rol | Listas de permitidos/bloqueados para los comandos del bot |
| 7. Varios | Auto-inicio, DMs, selecciones diarias, colores de embed, opciones de `/request`, comandos de Discord, botones de notificación |

### 3. Configurar el webhook de Seerr

En **Seerr → Configuración → Notificaciones → Webhook**, configura lo siguiente:

| Campo | Valor |
|---|---|
| URL del webhook | La URL que se muestra en Questorr en **Paso 2 → URL del Webhook de Seerr** |
| Cabecera de autorización | Pega el secreto mostrado en **Paso 2 → Copiar secreto** |

> El secreto se transmite mediante la cabecera `Authorization` — nunca aparece en la URL ni en los logs del servidor.

**Recomendado: activa todos los tipos de notificación en Seerr** para que Questorr pueda reenviar todo el ciclo de vida de la solicitud a Discord:

| Evento de Seerr | Qué hace Questorr |
|---|---|
| Solicitud pendiente de aprobación | Envía un DM solo al solicitante |
| Solicitud aprobada / aprobada automáticamente | Publica en el canal por defecto · envía un DM al solicitante |
| Contenido disponible | Publica en el canal de la carpeta raíz correspondiente · envía un DM al solicitante |
| Solicitud rechazada | Envía un DM solo al solicitante |
| Descarga fallida | Publica en el canal de administración |
| Incidencia creada | Publica en el **canal de administración** (con botones de Comentar / Resolver) |
| Incidencia comentada / resuelta / reabierta | Envía un **DM a quien la reportó** (para seguimientos de `/report`) |

> **Para que `/report` funcione**, activa las incidencias en **Seerr → Configuración → General**
> (*Activar reporte de incidencias*) y marca los eventos de webhook de **incidencias** arriba.
> Como Questorr actúa como el **usuario de Seerr vinculado** (Paso 5), ese usuario necesita
> el permiso correspondiente de Seerr para cada acción — **Solicitar** para pedir,
> **Auto-aprobar** para aprobación instantánea, **Reportar incidencias** para `/report`.

### 4. Enrutamiento de canales

En **Paso 2 → Asignación de carpeta raíz → canal**, haz clic en **Cargar carpetas raíz**, y luego asigna un canal de Discord a cada carpeta raíz de Radarr/Sonarr. Questorr enrutará automáticamente las notificaciones `MEDIA_AVAILABLE` al canal correcto — por ejemplo, las solicitudes de anime van a `#anime`, las películas a `#peliculas`.

### 5. Botones de notificación

En **Paso 7 → Botones de notificación**, puedes activar o desactivar individualmente qué botones aparecen en los embeds de notificación de Discord:

| Botón | Descripción |
|---|---|
| Ver en Seerr | Enlaza a la página del contenido en Seerr |
| ▶ ¡Ver ahora! | Enlace directo al reproductor de Jellyfin (solo contenido disponible) |
| Letterboxd | Enlaza a la página de Letterboxd (solo películas) |
| IMDb | Enlaza a la página de IMDb |

Usa el botón **Probar botones** para enviar una notificación de vista previa a tu canal de administración mostrando los botones actualmente activos.

---

## 🌐 Variables de entorno

| Variable | Descripción | Por defecto |
|---|---|---|
| `WEBHOOK_PORT` | Puerto del servidor web | `8282` |
| `LOG_LEVEL` | `error` / `warn` / `info` / `verbose` / `debug` | `info` |
| `TRUST_PROXY` | Establece en `false` para desactivar trust proxy (p. ej. sin proxy inverso) | `true` |

El resto de ajustes se gestionan a través del panel web y se guardan en `config/config.json`.

---

## 🔒 Seguridad

Questorr incluye el siguiente endurecimiento de seguridad:

| Función | Detalles |
|---|---|
| Contenedor sin root | El proceso se ejecuta como el usuario `app` mediante `entrypoint.sh` + `su-exec` |
| Content Security Policy | Cabeceras CSP estrictas vía `helmet` — scripts inline bloqueados, `frame-ancestors: none` |
| Cabecera de autorización | El secreto del webhook se transmite mediante la cabecera `Authorization`, nunca en la URL |
| Protección contra fuerza bruta | Los bloqueos de inicio de sesión persisten entre reinicios del contenedor (se escriben en disco) |
| Limitación de tasa | Los endpoints de API, configuración y webhook tienen limitación de tasa |
| Trust proxy configurable | `TRUST_PROXY=false` desactiva el trust proxy para despliegues directos |
| Permisos de directorios | Los directorios de configuración se crean con `0o755` en lugar de `0o777` |
| Registro de auditoría | Se registran los accesos al secreto del webhook y a la clave de API del widget |
| Actualizaciones de dependencias | Todas las dependencias de npm actualizadas, 0 vulnerabilidades conocidas |

---

## 🔮 Hoja de ruta

Las solicitudes de funciones aprobadas se siguen en el tablero público del proyecto:

➡️ **[Hoja de ruta de Questorr →](https://github.com/orgs/Jellyforge-Dev/projects/1)**

¿Tienes una idea? [Abre una solicitud de función](https://github.com/Jellyforge-Dev/Questorr/issues/new?template=feature_request.yml) — una vez revisada y aprobada, pasará al tablero.

---

## 📸 Capturas de pantalla

> Las capturas son de un entorno de demostración sin datos reales. La versión en vivo puede verse ligeramente distinta.

### Escritorio

<details>
<summary><b>Autenticación</b></summary>

| Registro | Inicio de sesión |
|---|---|
| ![Registro](assets/Screenshots/EN/Desktop/EN_register.png) | ![Inicio de sesión](assets/Screenshots/EN/Desktop/EN_login.png) |

</details>

<details>
<summary><b>Paso 1 – Configuración de Discord</b></summary>

| Parte 1 | Parte 2 |
|---|---|
| ![Discord 1/2](assets/Screenshots/EN/Desktop/EN_discord_1-2.png) | ![Discord 2/2](assets/Screenshots/EN/Desktop/EN_discord_2-2.png) |

</details>

<details>
<summary><b>Paso 2 – Configuración de Seerr</b></summary>

| Parte 1 | Parte 2 |
|---|---|
| ![Seerr 1/2](assets/Screenshots/EN/Desktop/EN_seerr_1-2.png) | ![Seerr 2/2](assets/Screenshots/EN/Desktop/EN_seerr_2-2.png) |

</details>

<details>
<summary><b>Paso 3–4 – Bases de datos multimedia y Jellyfin</b></summary>

| Bases de datos multimedia | Jellyfin |
|---|---|
| ![Bases de datos multimedia](assets/Screenshots/EN/Desktop/EN_mediadatabases.png) | ![Jellyfin](assets/Screenshots/EN/Desktop/EN_jellyfin.png) |

</details>

<details>
<summary><b>Paso 5–6 – Vinculación de usuarios y permisos por rol</b></summary>

| Vinculación de usuarios | Permisos por rol |
|---|---|
| ![Vinculación de usuarios](assets/Screenshots/EN/Desktop/EN_usermapping.png) | ![Permisos por rol](assets/Screenshots/EN/Desktop/EN_rolepermissions.png) |

</details>

<details>
<summary><b>Paso 7 – Varios y registros</b></summary>

| Varios 1/2 | Varios 2/2 | Registros |
|---|---|---|
| ![Varios 1/2](assets/Screenshots/EN/Desktop/EN_miscellaneous_1-2.png) | ![Varios 2/2](assets/Screenshots/EN/Desktop/EN_miscellaneous_2-2.png) | ![Registros](assets/Screenshots/EN/Desktop/EN_logs.png) |

</details>

---

### Móvil

<details>
<summary><b>Vistas móviles</b></summary>

| Registro | Inicio de sesión | Discord | Seerr |
|---|---|---|---|
| ![Registro](assets/Screenshots/EN/Mobile/EN_register.png) | ![Inicio de sesión](assets/Screenshots/EN/Mobile/EN_login.png) | ![Discord](assets/Screenshots/EN/Mobile/EN_discord.png) | ![Seerr](assets/Screenshots/EN/Mobile/EN_seerr.png) |

| Bases de datos multimedia | Jellyfin | Vinculación de usuarios | Permisos por rol |
|---|---|---|---|
| ![Bases de datos multimedia](assets/Screenshots/EN/Mobile/EN_mediadatabases.jpg) | ![Jellyfin](assets/Screenshots/EN/Mobile/EN_jellyfin.png) | ![Vinculación de usuarios](assets/Screenshots/EN/Mobile/EN_usermapping.png) | ![Permisos por rol](assets/Screenshots/EN/Mobile/EN_rolepermissions.png) |

| Varios | Registros |
|---|---|
| ![Varios](assets/Screenshots/EN/Mobile/EN_miscellaneous.png) | ![Registros](assets/Screenshots/EN/Mobile/EN_logs.jpg) |

</details>

---

## 🐳 Actualización

```bash
docker pull jellyforge/questorr:latest
docker compose up -d
```

---

## 📄 Licencia

Este proyecto está licenciado bajo la [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE). Puedes usar, modificar y distribuir este software libremente bajo los términos de la AGPL-3.0. Si ejecutas una versión modificada como servicio web, debes poner el código fuente a disposición del público.

---

<div align="center">

Mantenido por [Jellyforge-Dev](https://github.com/Jellyforge-Dev) &nbsp;|&nbsp; [💬 Discord](https://discord.gg/rXANrXJqVf) &nbsp;|&nbsp; [<img src="https://storage.ko-fi.com/cdn/cup-border.png" height="14" alt="Ko-fi"> Invítame un café](https://ko-fi.com/jellyforgedev)

</div>
