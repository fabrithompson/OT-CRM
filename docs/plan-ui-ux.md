# OT-CRM — Plan de mejoras UI/UX

Relevamiento del frontend al 6 de octubre de 2026 (rama `nilo`, commit `6da7b25`).
Amplía y ordena la sección "3. Visual / UX" de [backlog-mejoras.md](backlog-mejoras.md).

**Prioridades:** P1 = próximo sprint · P2 = planificado · P3 = incremental
**Tamaño:** S = menos de medio día · M = 1 día · L = 2–3 días

## Diagnóstico

| Problema | Evidencia |
|---|---|
| Sin sistema de diseño | 18 variables en `:root`, 140 colores hex distintos, 59 tamaños de fuente, 22 radios de borde |
| Estilos inline | ~1.100 `style={{}}`: Auditoria 273, Spam 165, Dashboard 119, Planes 77, Perfil 77 |
| No es usable en móvil | El sidebar no tiene modo drawer, `#root` usa `100vw/100vh` + `overflow: hidden`, `chat.css` y `dashboard.css` tienen solo 2 media queries cada uno |
| Accesibilidad | 25 `outline: none`, 1 sola regla `:focus-visible`, 14 `div`/`span` con `onClick`, pocos `aria-*` y `htmlFor` |
| Navegación frágil | No hay ErrorBoundary, no hay ruta 404, `Suspense` muestra un bloque negro vacío |
| Feedback inconsistente | `window.confirm` nativo, spinners sueltos sin skeletons, pocos estados vacíos, i18n incompleto |

El orden importa: la **Fase 0** crea los tokens y los componentes base que usan todas las demás fases.

---

## Fase 0 — Fundamentos (desbloquea todo)

- [x] **UX-01 · P1 · M · Design tokens.** Crear `src/assets/css/tokens.css` (se importa primero) con:
  colores semánticos (`--color-surface-1..3`, `--color-text-1..3`, `--color-accent`, `--color-success/warning/danger/info`), escala tipográfica (8 pasos), espaciado (`--space-1..8` en base 4px), radios (`--radius-sm/md/lg/full`), sombras (3 niveles), `--duration-*`/`--ease-*` y z-index.
  Las variables actuales (`--brand-green`, `--text-muted`, etc.) quedan como alias para no romper nada.
  *Hecho cuando:* los tokens existen, están documentados en el archivo y la app se ve igual que antes.

- [x] **UX-02 · P1 · L · Componentes base en `src/components/ui/`.** `Button` (variantes primary/secondary/ghost/danger, estado `loading`), `Field` (label + input + error con `htmlFor`/`aria-describedby`), `Modal` (focus trap, `Esc`, `aria-modal`, devuelve el foco al cerrar), `ConfirmDialog`, `Card`, `Badge`, `EmptyState`, `Skeleton`, `Spinner`.
  *Hecho cuando:* cada componente usa solo tokens y se puede operar entero con teclado.

- [x] **UX-03 · P1 · S · Layout raíz.** En `style.css` reemplazar `100vw/100vh` por `100%`/`100dvh` en `.app-loading`, `#root` y el layout principal. Revisar `overflow: hidden` en `body`.
  *Hecho cuando:* no hay scroll horizontal en desktop y la barra del navegador móvil no corta contenido.

## Fase 1 — Robustez de navegación

- [x] **UX-04 · P1 · S · ErrorBoundary.** `Sentry.ErrorBoundary` en `main.jsx`/`App.jsx` con una pantalla de fallback ("Algo salió mal" + recargar + volver al dashboard).
- [x] **UX-05 · P1 · S · Página 404.** Ruta `path="*"` en `App.jsx` con link al dashboard (o a la landing si no hay sesión).
- [x] **UX-06 · P1 · S · Carga entre páginas.** Reemplazar `<div className="app-loading" />` por un skeleton dentro de `MainLayout`, para que el sidebar no desaparezca al navegar.
- [x] **UX-07 · P3 · S · 401 sin recarga.** En `utils/api.js`, cambiar `window.location.href = '/login'` por navegación del router (evento + `useNavigate` en `App`).

## Fase 2 — Responsive

- [x] **UX-08 · P1 · M · Sidebar móvil.** Por debajo de 992px el `Sidebar` pasa a ser un drawer con botón hamburguesa en un header superior, overlay y cierre con `Esc` y al navegar.
- [x] **UX-09 · P1 · M · Kanban en móvil.** Las columnas toman ~85vw con `scroll-snap`, el drag & drop se reemplaza por "mover a etapa…" en el menú de la card y los filtros se colapsan.
- [x] **UX-10 · P1 · M · Chat en móvil.** `ChatModal` a pantalla completa por debajo de 768px: input fijo abajo con `env(safe-area-inset-bottom)`, emoji picker y slash menu sin desbordar, panel de info del contacto como pestaña.
- [x] **UX-11 · P2 · S · Dashboard.** Breakpoints en `dashboard.css` y gráficos de recharts dentro de `ResponsiveContainer` con alto mínimo.
- [x] **UX-12 · P2 · M · Tablas → cards.** En Contactos, Auditoría y Spam, por debajo de 768px cada fila se muestra como card con las acciones agrupadas.
  *Hecho cuando (Fase 2):* la app se puede usar a 375px, 768px y 1280px sin scroll horizontal.

## Fase 3 — Accesibilidad

- [x] **UX-13 · P1 · S · Foco visible global.** Una regla `:focus-visible` con `--color-focus` en `tokens.css`, y revisar los 25 `outline: none`: ninguno debe dejar un control sin indicador de foco.
- [x] **UX-14 · P1 · S · Clickeables semánticos.** Pasar los 14 `div`/`span`/`i` con `onClick` a `<button type="button">` (o `<Link>` si navegan), con `aria-label` en los que solo tienen ícono.
- [ ] **UX-15 · P2 · M · Formularios.** *(Auth hecho en el rediseño del login; faltan Perfil, Checkout, AgenteIA y RespuestasRapidas.)* Auth, Perfil, Checkout, AgenteIA y RespuestasRapidas sobre `Field`: label asociado, `aria-invalid`, error vinculado y `autocomplete` correcto.
- [ ] **UX-16 · P2 · M · Modales.** Migrar `StageModals`, `ChatModal` y los modales de Contactos/Auditoría/Spam al `Modal` base.
- [x] **UX-17 · P2 · S · Contraste y movimiento.** Verificar AA (4.5:1) de `--text-muted` sobre las superficies glass y ajustar el token si falla. Ampliar `prefers-reduced-motion` a `WaveCanvas`, `LogoOrb` y las transiciones del Kanban.

- [x] **UX-32 · P1 · M · Login con el estilo de la landing.** Panel con el cielo de Pexels + pestañas Ingresar / Crear cuenta (`role="tablist"`). Un solo formulario montado a la vez (antes había 2 `h1` y campos ocultos alcanzables con Tab), `autocomplete` correcto y errores con `role="alert"`.

## Fase 4 — Sacar estilos inline (una tarea por página)

Cada tarea mueve los `style={{}}` a clases que usan tokens y reemplaza botones, inputs y modales ad hoc por los de `ui/`. Solo quedan inline los valores realmente dinámicos (color de etapa, porcentajes).

- [ ] **UX-18 · P1 · L · Auditoria.jsx** (273)
- [ ] **UX-19 · P2 · L · Spam.jsx** (165)
- [ ] **UX-20 · P1 · M · Dashboard.jsx** (119)
- [ ] **UX-21 · P2 · M · Planes, Perfil, MiSuscripcion, Contactos** (~290)
- [ ] **UX-22 · P2 · M · Resto:** ChatModal, AgenteIA, Checkout, WhatsApp/Telegram vincular, RespuestasRapidas, Kanban (~300)

## Fase 5 — Feedback y flujo

- [ ] **UX-23 · P1 · M · Estados vacíos con acción.** Kanban sin leads → "Vinculá WhatsApp/Telegram". Contactos sin resultados → "Limpiar filtros" / "Importar Excel". Sin dispositivos → CTA de vinculación. Respuestas rápidas vacías → "Crear la primera".
- [ ] **UX-24 · P2 · M · Skeletons.** Dashboard (KPIs), Kanban (columnas), Contactos (filas) y chat (historial) muestran un skeleton con la forma del contenido, no un spinner.
- [ ] **UX-25 · P2 · S · Confirmaciones.** Reemplazar `window.confirm` (`Auditoria.jsx:1592`) y las demás acciones destructivas por `ConfirmDialog`. Donde se pueda deshacer, usar un toast con "Deshacer" en lugar de preguntar.
- [ ] **UX-26 · P2 · S · Toasts consistentes.** Tipos success/error/info con ícono, duración según el largo, `role="status"`/`aria-live` y un máximo de 3 apilados.
- [ ] **UX-27 · P2 · M · i18n completo.** Barrer los literales de Spam, Checkout, StageModals y los toasts, y agregar un lint que los detecte.
- [ ] **UX-28 · P3 · S · Chat sin `dangerouslySetInnerHTML`.** Renderizar texto con `white-space: pre-wrap` y linkificar con elementos React.

## Fase 6 — Pulido

- [ ] **UX-29 · P3 · M · Onboarding.** Checklist de primer uso en el Dashboard (vincular canal, configurar etapas, crear respuesta rápida, invitar equipo) que se oculta al completarse.
- [ ] **UX-30 · P3 · L · Modo claro.** Segundo set de tokens bajo `[data-theme="light"]` y un toggle en Perfil. Requiere la Fase 4 completa.
- [ ] **UX-31 · P2 · S · QA final.** Lighthouse y axe en Landing, Login, Dashboard, Kanban y Contactos. Objetivo: Accesibilidad ≥ 90 y ninguna violación "serious".

---

## Cómo probar localmente

Backend y base de datos en Docker, frontend con hot-reload (`vite.config.js` ya hace proxy de `/api/v1` y `/ws-crm` a `:8081`):

```bash
# 1. Docker Desktop abierto
docker compose up -d postgres backend      # backend en http://localhost:8081
# 2. Frontend
cd Frontend && pnpm install && pnpm dev   # http://localhost:5173
```

Checklist por tarea: probar a 375 / 768 / 1280 px (DevTools → modo dispositivo), navegar solo con teclado (Tab, Shift+Tab, Enter, Esc) y correr `pnpm lint` y `pnpm build` sin errores.
