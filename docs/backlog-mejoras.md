# OT-CRM — Backlog de mejoras

Auditoría del repositorio al 3 de septiembre de 2026 (rama `nilo`, commit `7c6a422`).
Alcance: Backend (Spring Boot 3.5 / Java 21, 130 archivos), Frontend (React 19 + Vite, 42 archivos), Bot-Whatsapp (Node/Baileys), Bot-Telegram (Python/Telethon), CI y base de datos.

**Prioridades:** P0 = arreglar ya · P1 = próximo sprint · P2 = deuda técnica planificada · P3 = mejora incremental

---

## 1. Seguridad

### P0 — Crítico

- [ ] **P0 · Proteger los endpoints abiertos del Bot de WhatsApp.** `GET /sessions`, `GET /qr/:sessionId` y `GET /session/status/:sessionId` no tienen `requireAuth` (`Bot-Whatsapp/index.js:1187`, `1243`, `1221`), a diferencia del resto de endpoints que sí lo tienen. `/sessions` devuelve todos los `sessionId` y los teléfonos conectados de todas las agencias; con ese id, `/qr/:sessionId` devuelve el QR de vinculación en vivo mientras una sesión está emparejándose, lo que permitiría a un tercero vincular su propio dispositivo a ese WhatsApp. El `docker-compose.yml` publica el puerto 3000 al host. **Acción:** agregar `requireAuth` a los tres endpoints y confirmar que el puerto del bot no sea alcanzable desde internet.
- [ ] **P0 · Restringir el CORS del bot.** `app.use(cors())` (`Bot-Whatsapp/index.js:389`) habilita cualquier origen; combinado con lo anterior, cualquier sitio web puede leer esos GET desde el navegador de una víctima. **Acción:** limitar a los orígenes propios.
- [x] **P0 · Autorizar las suscripciones WebSocket (fuga entre agencias).** ~~El `ChannelInterceptor` de `WebSocketConfig.java:99` solo actúa sobre `CONNECT`; no hay validación en `SUBSCRIBE` ni existe `@EnableWebSocketSecurity` en el proyecto. Los eventos se publican en `/topic/agencia/{id}`, `/topic/embudo/{id}` y `/topic/campania/{id}` (`ClienteController.java:393`, `506`; `CampaniaController.java:87`), así que un cliente conectado puede suscribirse al id de **otra** agencia y recibir sus mensajes y leads en tiempo real. Todo el control que hay en REST (`validarAccesoCliente`) se saltea por acá. **Acción:** interceptar `SUBSCRIBE` y verificar que el destino corresponda a la agencia del usuario autenticado.~~ Resuelto: `WebSocketConfig.authorizeSubscription` valida `/topic/{agencia|embudo|bot|campania|presence}/{agenciaId}` contra el `agenciaId` del `CrmUserDetails` autenticado, y `/topic/chat/{clienteId}[/status]` contra la agencia dueña del cliente (`ClienteRepository.existsByIdAndAgenciaId`).
- [x] **P0 · Rechazar el CONNECT sin token válido.** ~~`authenticateConnection` (`WebSocketConfig.java:112`) no asigna usuario si el token falta o es inválido, pero deja pasar el mensaje igual, y `/ws-crm/**` es `permitAll` en `SecurityConfig.java:84`. **Acción:** cortar la conexión en `preSend` cuando el CONNECT no autentique.~~ Resuelto: si tras `authenticateConnection` el `accessor.getUser()` sigue null, `preSend` tira `MessagingException` y corta la sesión.

### P1 — Alto

- [x] **P1 · Cambiar `anyRequest().permitAll()` por denegación por defecto.** ~~`SecurityConfig.java:88` deja público todo lo que no matchee una regla previa. Hoy eso alcanza a `POST /api/paypal/crear-suscripcion` (`PayPalController.java:44`) y `GET /api/presence/active` (`PresenceController.java:52`), que quedan fuera de autenticación: el de PayPal recibe la request anónima, falla con NPE al usar `@AuthenticationPrincipal` nulo y devuelve un 500 con el mensaje interno en vez de un 401. **Acción:** `anyRequest().authenticated()` con el fallback de la SPA declarado aparte, y mover PayPal/presence bajo `/api/v1/`.~~ Resuelto: ambos endpoints ahora viven bajo `/api/v1/`, `anyRequest().authenticated()`, y se agregó un `authenticationEntryPoint` propio (401 en vez del 403 default de Spring Security) para distinguir "no autenticado" de "sin permiso" (`@PreAuthorize`).
- [x] **P1 · Aplicar control de acceso por rol.** ~~No hay ni un `@PreAuthorize` ni `@EnableMethodSecurity` en todo el backend; los roles (OWNER/ADMIN/USER) se cargan en el `UserDetails` pero solo se chequean a mano en `PlanService` y `UsuarioService`. Cualquier miembro autenticado del equipo puede llamar endpoints pensados para dueños. **Acción:** habilitar method security y anotar los endpoints sensibles (equipo, planes, dispositivos, campañas).~~ `@EnableMethodSecurity` habilitado. Resuelto el caso más claro: `gestionarSolicitud` (aprobar/rechazar ingreso al equipo) ahora requiere `@PreAuthorize("hasAnyRole('ADMIN','OWNER')")` — antes cualquier `USER` podía sumar miembros al equipo. Quedan pendientes de una pasada aparte: dispositivos (WhatsApp/Telegram) y altas/bajas de dispositivos de campañas.
- [x] **P1 · Revisar el almacenamiento del JWT.** ~~El token vive en `localStorage` (`Frontend/src/utils/api.js:7`), dura 10 h y no hay refresh token ni lista de revocación: cerrar sesión no invalida nada del lado del servidor. **Acción:** evaluar cookie `httpOnly` + `SameSite` con CSRF, o al menos access token corto + refresh y revocación por `jti`.~~ Resuelto con la opción más chica: access token de 30 min + refresh token de 30 días, revocable por `jti` (tabla `refresh_tokens`, rotación en cada uso). Logout ahora revoca de verdad del lado del servidor. Cookie `httpOnly`+CSRF queda como mejora más grande, no encarada.
- [x] **P1 · Endurecer el rate limiting.** ~~`RateLimitFilter.getClientIp()` (`Backend/src/security/RateLimitFilter.java:96`) confía en `CF-Connecting-IP` y `X-Forwarded-For` sin verificar que la request venga del proxy; si el backend es alcanzable directo, se saltea el límite rotando el header. **Acción:** validar la IP de origen contra los rangos del proxy o usar `ForwardedHeaderFilter` con proxies confiables.~~ `CF-Connecting-IP` ahora requiere `APP_SECURITY_TRUST_CLOUDFLARE_HEADER=true` (default `false`): confirmar con infra si Cloudflare es el único camino a Railway antes de activarlo.
- [x] **P1 · Eliminar la enumeración de usuarios.** ~~`iniciarRecuperacionPassword` (`UsuarioService.java:257`) lanza "No existe una cuenta con ese email", que el controller devuelve como 400: permite descubrir qué emails están registrados. `resend-code` ya usa una respuesta genérica. **Acción:** responder siempre igual, haya o no cuenta.~~ Resuelto en `iniciarRecuperacionPassword`, `restablecerPassword` y `reenviarCodigo`: mismo status y mismo cuerpo de respuesta exista o no la cuenta.
- [x] **P1 · Limitar intentos del código de recuperación.** ~~El código es numérico de 6 dígitos con 15 min de validez, sin contador de intentos por cuenta (`UsuarioService.java:88`, `268`). El único freno es el rate limit por IP. **Acción:** invalidar el código tras N intentos fallidos.~~ Resuelto: 5 intentos máximo (columna `codigo_intentos`), compartido entre el código de verificación de cuenta y el de recuperación (reutilizan el mismo campo). Se invalida el código al agotarlos.

### P2 — Medio

- [ ] **P2 · Unificar la comparación de tokens en tiempo constante.** `ChatController.java:193` usa `botSecretKey.equals(token)`, mientras `WebhookInterceptor` usa `SecurityUtil.constantTimeEquals`. Mismo caso en `Bot-Whatsapp/index.js:328` y `Bot-Telegram/telegram_bridge.py:42`. **Acción:** comparación constante en los tres.
- [ ] **P2 · Validar la pertenencia en `forceUserAgencia`.** `WebSocketPresenceEventListener.java:212` guarda el `agenciaId` que manda el cliente en el heartbeat sin verificar que el usuario pertenezca a esa agencia (`PresenceController.java:39`). **Acción:** tomar la agencia de la base, no del payload.
- [ ] **P2 · No devolver mensajes de excepción al cliente.** `GlobalExceptionHandler` retorna `ex.getMessage()` en `IllegalArgumentException` e `IllegalStateException`, y `PayPalController.java:96` concatena el mensaje de la excepción en la respuesta. **Acción:** mensajes genéricos al cliente, detalle solo al log.
- [ ] **P2 · Sacar los teléfonos de los logs.** PII en texto plano en `GoogleContactsService.java:263`, `WhatsAppService.java:589` y `Bot-Whatsapp/index.js:859`. **Acción:** enmascarar (ej. `+54911****89`).
- [ ] **P2 · Actualizar jjwt.** Está en 0.11.5 (2022) con API deprecada (`parserBuilder`, `setClaims`, `SignatureAlgorithm`) en `JwtUtil.java`. **Acción:** migrar a 0.12.x.
- [ ] **P2 · Quitar el dominio hardcodeado de la CSP.** `connect-src` fija `wss://ot-crm.com` y `https://ot-crm.com` en el código (`SecurityConfig.java:71`). **Acción:** parametrizar por entorno.
- [ ] **P3 · Revisar el token en query param del handshake WS.** `PresenceHandshakeInterceptor.java:52` acepta el JWT por `?token=`, lo que lo expondría en logs de acceso y `Referer`. Hoy el frontend usa `connectHeaders`, así que ese camino está sin uso. **Acción:** eliminar el fallback.
- [ ] **P3 · Restringir el código de invitación.** `AgenciaController` devuelve `codigoInvitacion` a cualquier miembro autenticado de la agencia. **Acción:** limitarlo a OWNER/ADMIN.

---

## 2. Técnico / Arquitectura

- [ ] **P1 · Completar la configuración de Google Contacts.** `application.properties:108-113` usa `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` y `APP_FRONTEND_URL`, pero ninguna está en `.env.example` ni en `docker-compose.yml`: la feature más nueva no se puede configurar por la vía documentada. **Acción:** agregarlas a ambos archivos.
- [ ] **P1 · Sacar Vite del canal beta.** `Frontend/package.json` fija `vite: ^8.0.0-beta.13` y lo fuerza con `overrides` — es la herramienta que construye el bundle de producción. **Acción:** pasar a la última estable.
- [ ] **P1 · Introducir DTOs de salida.** Hay 6 DTOs para 22 entidades; los controllers devuelven entidades JPA directamente (`PlanController.java:57` retorna `List<Plan>`) o `Map<String, Object>` armados a mano. Eso expone campos internos, acopla la API al modelo y complica versionar. **Acción:** DTOs explícitos con records en los endpoints más usados.
- [ ] **P2 · Migrar el rate limiting a almacenamiento compartido.** Bucket4j + Caffeine son por instancia (comentado en el propio archivo); con más de una réplica el límite se multiplica. **Acción:** Redis cuando se escale horizontalmente.
- [ ] **P2 · Cachear la carga del usuario por request.** `JwtRequestFilter` llama a `loadUserByUsername` en cada request autenticada, o sea un `SELECT` por request. Ya existe `CacheConfig` con Caffeine. **Acción:** cachear `UserDetails` con TTL corto e invalidación al cambiar rol o estado.
- [ ] **P2 · Parametrizar las rutas de recursos estáticos.** `MvcConfig.java:26-31` tiene `file:/app/static/` hardcodeado, que solo existe dentro del contenedor. **Acción:** llevarlo a una property.
- [ ] **P2 · Partir los archivos más grandes.** `WhatsAppService.java` (897), `ClienteController.java` (768), `AiAuditService.java` (657) y `EmailService.java` (633) en backend; `Auditoria.jsx` (2212), `Spam.jsx` (1134) y `ChatModal.jsx` (953) en frontend. **Acción:** extraer servicios y hooks por responsabilidad.
- [ ] **P3 · Revisar `Cliente.etiquetas` EAGER.** El `@ManyToMany` EAGER de `Cliente.java:124` dispara consultas extra en listados que no lo necesiten; hay `@EntityGraph` en `ClienteRepository` que cubre varios casos. **Acción:** pasar a LAZY y resolver con fetch join donde haga falta.
- [ ] **P3 · Limpiar el `version:` obsoleto del compose** y el contenedor huérfano `crm_redis` que Docker reporta en cada `up`.

---

## 3. Visual / UX

- [ ] **P1 · Agregar un ErrorBoundary.** No hay ninguno pese a que `@sentry/react` ya está instalado e inicializado (`main.jsx:9`): cualquier error de render deja la pantalla en blanco y sin reporte. **Acción:** `Sentry.ErrorBoundary` con pantalla de fallback.
- [ ] **P1 · Ruta 404.** `App.jsx` no tiene catch-all `path="*"`: una URL desconocida renderiza vacío. **Acción:** página 404 con vuelta al dashboard.
- [ ] **P1 · Estado de carga real en las transiciones.** El `fallback` del `Suspense` es `<div className="app-loading" />`, un bloque vacío: al navegar entre páginas lazy se ve un flash negro. **Acción:** skeleton o spinner con el layout de la página destino.
- [ ] **P1 · Migrar los estilos inline a CSS.** Hay alrededor de 1.100 `style={{}}` en JSX — 273 solo en `Auditoria.jsx`, 165 en `Spam.jsx`, 119 en `Dashboard.jsx` — contra apenas 43 variables CSS definidas. Los valores se repiten hardcodeados (`#94a3b8`, `0.9rem`) y no hay forma de cambiar la identidad visual desde un solo lugar. **Acción:** ampliar los design tokens (espaciado, tipografía, radios, sombras) y mover los estilos a clases.
- [ ] **P1 · Accesibilidad de teclado.** Una sola regla `:focus-visible` en unas 8.000 líneas de CSS, y 14 `<div>`/`<span>` con `onClick` sin rol ni manejo de teclado. **Acción:** estados de foco visibles en toda la app y convertir los clickeables en `<button>`.
- [ ] **P2 · Completar la traducción.** El sistema i18n tiene `es` y `en` (`translations.js`, 1313 líneas) pero la cobertura es despareja: `Spam.jsx` usa `t()` 32 veces en 1134 líneas, `Checkout.jsx` 2 veces en 431, `StageModals.jsx` 1 vez. Quedan textos y toasts fijos en español ("Cancelar", "Elegí tu método de pago", "No se pudo enviar"), así que cambiar a inglés deja media app en español. **Acción:** barrer los literales y agregar un lint que los detecte.
- [ ] **P2 · Responsive del chat y el dashboard.** `chat.css` y `dashboard.css` tienen 2 media queries cada uno (contra 15 en `style.css`), justo en las dos pantallas de trabajo diario. A eso se suma `body { overflow: hidden }` con `100vw/100vh` en `#root` (`style.css:31`), que en móvil provoca corte por la barra del navegador y scroll horizontal por el ancho de la scrollbar. **Acción:** revisar breakpoints y usar `100dvh` / `100%`.
- [ ] **P2 · Accesibilidad general.** 33 atributos `aria-*` y 17 `role=` en 21.000 líneas de JSX, y 11 `htmlFor` para muchos más inputs. **Acción:** pasada de etiquetado en formularios y modales.
- [ ] **P3 · Modo claro.** No hay ninguna regla `prefers-color-scheme` ni `data-theme`: la app es solo oscura. **Acción:** evaluar tema claro sobre los tokens ya existentes.
- [ ] **P3 · Reemplazar `dangerouslySetInnerHTML` en el chat.** `ChatModal.jsx:837` inyecta HTML; hoy es seguro porque `escapeHtml` (línea 819) escapa `&`, `<`, `>` y `"` antes, pero esa seguridad depende de que nadie toque esa línea (por ejemplo al agregar detección de links). **Acción:** renderizar texto plano con `white-space: pre-wrap` y eliminar la inyección.
- [ ] **P3 · Redirección de sesión sin recarga.** El interceptor de 401 hace `window.location.href = '/login'` (`api.js:19`), que recarga toda la SPA. **Acción:** navegar con el router.

---

## 4. Calidad y CI/CD

- [ ] **P1 · Tests de frontend.** No existe ningún `.test.` ni `.spec.` en `Frontend/`; el CI solo verifica que el build genere `dist`. **Acción:** Vitest + Testing Library sobre login, kanban y chat.
- [ ] **P1 · Correr el linter en CI.** Hay ESLint 10 configurado y el script `pnpm lint`, pero `deploy.yml` nunca lo ejecuta. **Acción:** agregar el paso.
- [ ] **P1 · Escaneo de dependencias.** No hay `dependabot.yml`, ni `pnpm audit`, ni análisis de vulnerabilidades en el pipeline — en un proyecto que ya tomó la decisión de bloquear npm por supply chain (`check-package-manager.js`). **Acción:** Dependabot + `pnpm audit` + OWASP dependency-check en el job de backend.
- [ ] **P2 · Medir cobertura.** 10 archivos de test (todos de integración con Testcontainers) para 130 de código, sin JaCoCo ni umbral. **Acción:** JaCoCo con mínimo acordado y tests unitarios de la lógica de planes y límites.
- [ ] **P2 · Análisis estático de seguridad.** Sumar CodeQL al pipeline.
- [ ] **P3 · Sacar los `console.log` de producción.** Alrededor de 45 repartidos en 15 archivos del frontend. **Acción:** regla de ESLint y/o `drop_console` en el build.
- [ ] **P3 · Documentar el arranque local.** El README documenta `docker-compose up --build` (todo en `:8080`), pero el flujo real de desarrollo es backend en Docker (`:8081`) + `pnpm dev` (`:5173`), que es justamente lo que ya asume el proxy de `vite.config.js`. **Acción:** sección de desarrollo local en el README.

---

## Lo que ya está bien resuelto

Vale registrarlo para no romperlo en los refactors:

- Migraciones Flyway versionadas (V1–V12) con índices compuestos por agencia y `ddl-auto=validate`.
- Aislamiento multi-tenant consistente en REST (`validarAccesoCliente` y equivalentes).
- `spring.jpa.open-in-view=false` con `@EntityGraph` donde hace falta.
- Cabeceras de seguridad completas: HSTS, CSP, frame-options, referrer-policy, permissions-policy.
- Comparación en tiempo constante en el interceptor de webhooks, verificación de firmas de MercadoPago/PayPal e idempotencia vía `processed_webhooks`.
- `SecureRandom` en todos los códigos de verificación, con expiración y un solo uso.
- Protección SSRF en el bot de WhatsApp.
- Backup diario de la base con verificación de integridad del dump.
- Code splitting por ruta en el frontend y `StartupValidator` que falla rápido si falta configuración.
