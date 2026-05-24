# Auditor IA — Documentación técnica

## ¿Qué es y para qué sirve?

El **Auditor IA** es un módulo que analiza automáticamente las conversaciones de WhatsApp entre los vendedores y los clientes, y detecta incumplimientos a los procedimientos de atención configurados por el administrador.

**Problema que resuelve:** en un equipo de ventas con múltiples operadores, es imposible revisar manualmente cientos de conversaciones diarias para verificar que se estén siguiendo los procedimientos. El auditor lo hace de forma automática usando GPT-4o, a las 7:00 AM todos los días, y le manda un reporte al gerente por email y/o WhatsApp.

**Restricciones de diseño importantes:**
- El auditor es **de solo lectura** sobre las conversaciones — nunca envía mensajes a clientes.
- La funcionalidad está **bloqueada por plan**: solo agencias con `Plan.agenteIaHabilitado = true` (ENTERPRISE) pueden usarla.
- Cada hallazgo debe tener una **cita textual obligatoria** del mensaje que lo evidencia. Si GPT no puede citar el mensaje, el hallazgo se descarta antes de guardar.

---

## Arquitectura general

```
Celular del vendedor
        │  (Fase 0)
        ▼
  Baileys (Bot Node.js)
  messages.upsert { fromMe: true }
        │
        ▼  POST /api/webhook/whatsapp/outbound-external
  WhatsAppWebhookController
        │
        ▼
  WhatsAppService.guardarMensajeSalidaExterno()
  → Mensaje guardado con autor = "EXTERNO_WSP"
        │
        │  (Fase 2 / Fase 3)
        ▼
  AiAuditService.auditarAgencia()
  ├── Pre-filtro SQL: clientes activos en las últimas 24 hs (máx. 30)
  ├── Construye transcripciones de conversaciones
  ├── Llama a GPT-4o con las instrucciones del auditor
  ├── Parsea el JSON de respuesta
  ├── Descarta hallazgos sin cita_textual
  └── Guarda AiAuditReport en PostgreSQL (hallazgos_json = jsonb)
        │
        ├── Email HTML → EmailService.enviarReporteAuditoria()
        └── WhatsApp resumen → WhatsAppService.enviarTextoANumero()
```

---

## Fases implementadas

### Fase 0 — Captura de mensajes salientes desde el celular del vendedor

**Commit:** `feat(auditor-ia): fase 0`

**Problema:** el CRM registra los mensajes que envía el bot, pero no los que el vendedor manda desde su celular físico. Sin esos mensajes, la auditoría estaría incompleta.

**Solución:** Baileys (la librería de WhatsApp que corre en Node.js) emite el evento `messages.upsert` también para mensajes `fromMe: true` cuando el teléfono está vinculado como dispositivo compañero. Interceptamos esos eventos y los mandamos al backend.

**Archivos modificados:**
- `Bot-Whatsapp/index.js` — handler de `messages.upsert` separado para `fromMe: true`
- `Backend/src/controller/WhatsAppWebhookController.java` — nuevo endpoint `POST /api/webhook/whatsapp/outbound-external`
- `Backend/src/service/WhatsAppService.java` — método `guardarMensajeSalidaExterno()`

**Flujo:**
1. Vendedor manda un mensaje desde su celular
2. Baileys recibe el evento `fromMe: true`
3. Node.js hace POST a `/api/webhook/whatsapp/outbound-external` con `{ sessionId, to, body, whatsappId }`
4. El backend busca el cliente por teléfono (nunca crea uno nuevo si no existe)
5. Desduplicación por `whatsappId` para evitar doble registro
6. Se guarda el mensaje con `autor = "EXTERNO_WSP"`

**Limitación conocida:** Baileys en modo dispositivo compañero no garantiza la entrega del 100% de los eventos `fromMe`. En pruebas se capturaron ~2/7 mensajes. Es una limitación de la plataforma, no del código.

---

### Fase 1 — Migración de base de datos y configuración desde la UI

**Commit:** `feat(auditor-ia): fase 1`

**Qué se creó:**

**Migración Flyway `V6__ai_auditor.sql`:**
```sql
-- Nueva tabla para guardar los reportes de auditoría
CREATE TABLE ai_audit_report (
    id               BIGSERIAL PRIMARY KEY,
    agencia_id       BIGINT NOT NULL REFERENCES agencias(id) ON DELETE CASCADE,
    periodo_inicio   TIMESTAMP NOT NULL,
    periodo_fin      TIMESTAMP NOT NULL,
    resumen          TEXT,
    hallazgos_json   JSONB,         -- array de hallazgos con citas textuales
    incumplimientos  INT NOT NULL DEFAULT 0,
    tokens_usados    INT NOT NULL DEFAULT 0,
    created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Columnas de configuración del auditor en agent_config
ALTER TABLE agent_config
    ADD COLUMN audit_enabled         BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN audit_procedures      TEXT,      -- procedimientos a controlar (texto libre)
    ADD COLUMN audit_email           VARCHAR(255),
    ADD COLUMN audit_whatsapp_phone  VARCHAR(50),
    ADD COLUMN audit_dispositivo_id  BIGINT REFERENCES dispositivos(id) ON DELETE SET NULL;

-- Horario laboral en agencias (solo se auditan mensajes dentro de este rango)
ALTER TABLE agencias
    ADD COLUMN horario_laboral_inicio TIME,
    ADD COLUMN horario_laboral_fin    TIME;
```

**Endpoints nuevos en `AgentConfigController`:**
- `GET /api/v1/agent-config/audit` — carga la configuración del auditor
- `PUT /api/v1/agent-config/audit` — guarda configuración (requiere plan ENTERPRISE)

**UI en `AgenteIA.jsx`:** sección "Auditor de procedimientos" con:
- Toggle para activar la auditoría diaria
- Textarea para describir los procedimientos a controlar
- Horario laboral (rango de horas en que aplica la auditoría)
- Email del reporte
- Número de WhatsApp para el resumen ejecutivo
- Dispositivo que envía el resumen por WhatsApp

---

### Fase 2 — Motor de auditoría y botón "Auditar ahora"

**Commit:** `feat(auditor-ia): fase 2`

**Archivos nuevos:**
- `Backend/src/service/AiAuditService.java`
- `Backend/src/controller/AuditController.java`

**Cómo funciona `AiAuditService.auditarAgencia()`:**

1. **Validaciones previas:** verifica que el auditor esté habilitado y que haya procedimientos configurados.

2. **Pre-filtro de clientes:** consulta nativa en `MensajeRepository` que devuelve los IDs de clientes con actividad en el período (máximo 30 para controlar el costo de tokens):
   ```sql
   SELECT DISTINCT m.cliente_id FROM mensaje m
   JOIN clientes c ON c.id = m.cliente_id
   WHERE c.agencia_id = :agenciaId
   AND m.fecha_hora BETWEEN :desde AND :hasta
   LIMIT 30
   ```

3. **Construcción del contexto:** para cada cliente, carga sus últimos 25 mensajes del período y los formatea como transcripción:
   ```
   === CLIENTE: Juan Pérez (ID:42) ===
   [14/05 10:32] CLIENTE: Hola, quiero info del producto X
   [14/05 10:45] VENDEDOR[María]: Hola! Te paso los precios...
   ```

4. **Llamada a GPT-4o:** usa `OpenAiChatOptions` para sobrescribir el modelo por defecto (`gpt-4o-mini`) con `gpt-4o`, con `temperature=0.1` para respuestas deterministas.

5. **Parseo del JSON:** extrae el array `hallazgos` de la respuesta. **Descarta cualquier hallazgo que no tenga `cita_textual`** — esta es una regla de negocio crítica para evitar alucinaciones.

6. **Persistencia:** guarda `AiAuditReport` con el JSON de hallazgos, conteo de incumplimientos y tokens usados.

**Nota técnica — campo `hallazgos_json`:** PostgreSQL rechaza insertar un `varchar` en una columna `jsonb`. La solución es anotar el campo en la entidad con `@JdbcTypeCode(SqlTypes.JSON)` de Hibernate 6, que genera el cast correcto automáticamente.

**Endpoints en `AuditController`:**
- `POST /api/v1/audit/run-now` — ejecuta una auditoría de las últimas 24 hs inmediatamente
- `GET /api/v1/audit/reports` — lista todos los reportes de la agencia (orden desc por fecha)
- `PATCH /api/v1/audit/reports/{id}/hallazgo/{idx}/false-positive` — marca/desmarca un hallazgo como falso positivo y recalcula el conteo

---

### Fase 3 — Scheduler diario y notificaciones

**Commit:** `feat(auditor-ia): fase 3`

**Archivos nuevos/modificados:**
- `Backend/src/service/AiAuditScheduler.java` — cron job
- `Backend/src/service/EmailService.java` — método `enviarReporteAuditoria()`
- `Backend/src/service/WhatsAppService.java` — método `enviarTextoANumero()`
- `Backend/src/repository/AgentConfigRepository.java` — `findByAuditEnabledTrue()`

**Scheduler:**
```java
@Scheduled(cron = "0 0 7 * * *", zone = "America/Argentina/Buenos_Aires")
public void ejecutarAuditoriaDiaria() { ... }
```
Corre a las 07:00 todos los días (hora Argentina). Itera todas las agencias con `audit_enabled = true`, ejecuta la auditoría por las últimas 24 hs y, si hay resultados, envía las notificaciones configuradas.

**Email:** template HTML dark con el resumen, tabla de hallazgos por severidad (verde/amarillo/rojo) y citas textuales en blockquote. Se envía via Resend API de forma asíncrona (`@Async`).

**WhatsApp:** mensaje de texto plano con formato Markdown de WhatsApp (`*negrita*`, `_cursiva_`) enviado al número configurado a través del dispositivo seleccionado.

---

### Fase 4 — Página de historial (`/auditoria`)

**Commit:** `feat(auditor-ia): fase 4`

**Archivo nuevo:** `Frontend/src/pages/Auditoria.jsx`

**Funcionalidades:**
- Lista de reportes pasados en panel izquierdo (fecha, período, badge de incumplimientos)
- Panel de detalle al seleccionar un reporte: resumen ejecutivo + listado de hallazgos
- Cada hallazgo muestra: regla violada, descripción, cita textual en blockquote, vendedor, nivel de confianza y severidad (alta/media/baja con color)
- Botón **"Falso positivo"** por hallazgo: lo opaca visualmente y lo excluye del conteo. El cambio persiste en la base de datos
- Botón **"Auditar ahora"** en el topbar para disparar una auditoría manual
- La ruta `/auditoria` y el ítem del sidebar solo son visibles para usuarios con plan ENTERPRISE

---

### Fase 5 — Análisis profundo punto por punto + envío inmediato

**Commit:** `feat(auditor-ia): fase 5`

**Cambios:**

**Prompt rediseñado (`AiAuditService.buildAuditSystemPrompt`):**
Pasamos de un esquema simple (`resumen` + `hallazgos[]`) a un análisis detallado por cada punto del procedimiento. El nuevo prompt instruye al modelo a:

1. Identificar cada línea/ítem de la lista de procedimientos como un punto de control separado.
2. Indicar por cada punto el estado: `cumplido`, `parcial` o `incumplido`.
3. Por cada evidencia incluir explícitamente: NOMBRE del vendedor (no su ID), HORARIO exacto (dd/MM HH:mm), CITA textual exacta entre comillas, CÓMO lo hizo (tono/formato/claridad) y — si es parcial/incumplido — ESPERADO vs OCURRIDO.
4. Resumen ejecutivo de 2-3 párrafos mencionando vendedores destacados/críticos por nombre y recomendaciones.
5. Reglas duras: no respuestas genéricas, descartar evidencias sin cita textual exacta.

**Nuevo esquema almacenado en `hallazgos_json`:**
```json
{
  "resumen_ejecutivo": "Párrafo 1...\n\nPárrafo 2...\n\nPárrafo 3...",
  "procedimientos": [
    {
      "punto": "Saludar al cliente apenas escribe",
      "estado": "cumplido" | "parcial" | "incumplido",
      "justificacion": "Explicación detallada",
      "evidencias": [
        {
          "vendedor": "María",
          "cliente_id": 42,
          "cuando": "14/05 10:32",
          "como": "Saludo cordial y oportuno, siguió el script",
          "cita_textual": "Hola, ¿en qué te ayudo?",
          "esperado": "Solo si parcial/incumplido",
          "ocurrido": "Solo si parcial/incumplido"
        }
      ]
    }
  ],
  "hallazgos": [
    /* mismo formato que antes — usado para los hallazgos individuales graves */
  ]
}
```

**Compatibilidad hacia atrás:** los reportes antiguos (formato array directo) siguen siendo legibles. `parseReportPayload` en `Auditoria.jsx` detecta el tipo y los envuelve automáticamente.

**Conteo de incumplimientos:** prioriza la cantidad de `procedimientos[].estado === "incumplido"`; si no hay procedimientos (formato legacy), cae al conteo de hallazgos.

**UI expandida (`Auditoria.jsx`):**
- Sección **"Resumen ejecutivo"** muestra el texto extendido en 2-3 párrafos.
- Sección **"Procedimientos auditados"** con cards colapsables por cada punto:
  - Badge de estado con color e ícono: ✅ Cumplido / ⚠️ Parcial / ❌ Incumplido.
  - Contador agregado en el header de la sección (X cumplidos / Y parciales / Z incumplidos).
  - Por defecto se expanden automáticamente los puntos `parcial` e `incumplido`.
  - Cada evidencia muestra: vendedor destacado en violeta, horario con ícono de reloj, descripción del "cómo", cita textual en blockquote, y bloques contrastantes "Esperado" vs "Ocurrido" cuando aplica.
- Sección **"Hallazgos individuales"** se mantiene como antes (sirve como red flags + soporta toggling de falsos positivos).
- Animación `fadeIn` al abrir/cerrar puntos de procedimiento.

**Envío inmediato en "Auditar ahora" (`AuditController.runAuditNow`):**
1. Ejecuta la auditoría sobre las últimas 24 hs (igual que antes).
2. **NUEVO:** lee `AgentConfig` y, en el mismo request:
   - Si hay `auditEmail` configurado → llama a `emailService.enviarReporteAuditoria` (async, no bloquea).
   - Si hay `auditWhatsappPhone` + `auditDispositivo` → llama a `whatsAppService.enviarTextoANumero`.
3. La respuesta JSON incluye dos flags nuevos: `sentEmail: bool` y `sentWhatsapp: bool`.
4. El frontend usa esos flags para mostrar un toast diferenciado:
   - Verde: "Email y WhatsApp despachados correctamente."
   - Azul: cuando solo uno fue enviado (el otro no está configurado).
   - Amarillo: cuando ningún destino está configurado.
5. El scheduler diario (`AiAuditScheduler`) sigue funcionando intacto. Son dos envíos independientes.

**Archivos modificados:**
- `Backend/src/service/AiAuditService.java` — nuevo prompt + parseo del JSON extendido + storage como objeto.
- `Backend/src/controller/AuditController.java` — envío inmediato post-auditoría + compat de `toggleFalsePositive` con el wrapper nuevo.
- `Frontend/src/pages/Auditoria.jsx` — UI rediseñada con secciones colapsables, badges visuales y toast de confirmación de envío.

---

### Fase 6 — Visualización en tiempo real desde todos los dispositivos

**Commit:** `feat(auditor-ia): fase 6`

**Contexto:** los mensajes que entran o salen vía el bot del CRM ya se broadcasteaban por WebSocket a `/topic/embudo/{agenciaId}` y `/topic/chat/{clienteId}`. Faltaban dos piezas para que el embudo refleje fielmente lo que ocurre desde **cualquier** origen (celular del vendedor, web, otros clientes WhatsApp del mismo número):

1. **Mensajes del celular hacia números nuevos** quedaban descartados porque `guardarMensajeSalidaExterno` solo registraba si el cliente ya existía.
2. **El frontend no diferenciaba visualmente** mensajes salientes del CRM vs. del celular vs. del Agente IA.

**Cambios:**

**`WhatsAppService.guardarMensajeSalidaExterno`** — si el número de destino no existe como cliente y el dispositivo no es de propósito CAMPAÑAS, ahora se crea automáticamente un cliente nuevo:
- `nombre` = `Cliente <telefono>` (placeholder hasta que se clasifique).
- `origen` = `EXTERNO_WSP` (queda visible en filtros).
- `etapa` = la inicial de la agencia (vía `etapaRepository.findFirstByAgenciaIdAndEsInicialTrue`).
- Respeta `puedeRecibirNuevoContacto` — si el plan está al tope, se ignora con log informativo.

Esto desencadena el `notificarCambio` habitual → la tarjeta aparece en el embudo en tiempo real con el último mensaje saliente, sin necesidad de reload.

**`ChatNotification` (WebSocket payload)** — se agregó el campo `origenMensaje` con valores semánticos: `CLIENTE`, `CRM`, `EXTERNO_WSP`, `AGENTE_IA`. El helper `deducirOrigenMensaje` lo calcula a partir del `autor` y la dirección. El frontend lo usa para dibujar el ícono correcto sin tener que parsear strings.

**`ChatModal.MessageBubble`** — cada mensaje saliente ahora muestra un pequeño ícono con tooltip al lado del nombre del autor:
- `fa-mobile-screen-button` (ámbar) → mensaje enviado desde el celular del vendedor.
- `fa-robot` (violeta) → mensaje del Agente IA.
- `fa-desktop` (celeste) → mensaje enviado desde el CRM.

El label `EXTERNO_WSP` se reemplaza por `Vendedor (celular)` para que sea legible.

**`KanbanCard`** — la línea de preview del último mensaje:
- Si el resumen empieza con `EXTERNO_WSP:` → se reemplaza por un ícono de celular ámbar + el texto del mensaje.
- Si empieza con `AGENTE_IA:` o `IA_*:` → ícono de robot violeta + texto.
- Caso contrario, comportamiento previo intacto.

**Resultado:** el embudo y el chat muestran en tiempo real y de manera diferenciada **todos** los mensajes entrantes y salientes — sin importar si el vendedor escribió desde el CRM, desde su celular físico, o si fue el Agente IA quien respondió. Los números nuevos contactados desde el celular crean automáticamente una tarjeta pendiente de clasificar en la primera etapa del kanban.

**Limitaciones conocidas:**
- Mensajes salientes desde el celular en dispositivos de **propósito CAMPAÑAS** siguen sin registrarse (decisión de diseño: las campañas son envío masivo, no atención individual).
- La captura desde el celular depende del evento `messages.upsert { fromMe: true }` de Baileys, que en modo "dispositivo compañero" no garantiza el 100% de entrega — limitación de plataforma documentada en Fase 0.

**Archivos modificados:**
- `Backend/src/service/WhatsAppService.java` — auto-creación de cliente pendiente + nuevo campo `origenMensaje` en `ChatNotification` + helper `deducirOrigenMensaje`.
- `Frontend/src/components/kanban/ChatModal.jsx` — helper `deducirOrigenVisual` + ícono con tooltip en `MessageBubble` para cada mensaje saliente + label amigable para `EXTERNO_WSP`.
- `Frontend/src/components/kanban/KanbanCard.jsx` — detección del prefijo de origen en `ultimoMensajeResumen` y reemplazo por ícono visual.

---

### Fase 7 — Tabs, CRUD y reorden del historial

**Commit:** `feat(auditor-ia): fase 7`

**Cambios:**

**Migración Flyway V7** (`V7__ai_auditor_crud.sql`):
- `ai_audit_report.nombre VARCHAR(255)` — etiqueta editable opcional.
- `ai_audit_report.notas TEXT` — anotaciones internas del usuario.
- `ai_audit_report.orden INT` — posición manual; `NULL` = orden por fecha desc.
- Índice `idx_audit_report_agencia_orden(agencia_id, orden NULLS LAST, created_at DESC)`.

**Repository** (`AiAuditReportRepository`):
- Nuevo método `findAllForAgenciaSorted` con `@Query` JPQL: respeta el orden manual cuando hay `orden NOT NULL`, y cae a `createdAt DESC` para los reportes sin orden manual.

**AuditController** — 3 endpoints nuevos:
- `PATCH /api/v1/audit/reports/{id}` — body `{nombre, notas}` actualiza metadatos. Strings vacíos limpian, `null` mantiene el valor previo.
- `DELETE /api/v1/audit/reports/{id}` — elimina el reporte. Confirma ownership por agencia antes de borrar.
- `POST /api/v1/audit/reports/reorder` — body `{orden: [id1, id2, ...]}` aplica el orden manual. Sólo se aplica a reportes de la agencia del usuario; IDs ajenos se ignoran.
- `getReports` ahora usa el orden con `orden NULLS LAST`.
- `toMap` expone `nombre`, `notas`, `orden`.

**Frontend `Auditoria.jsx`** — refactor mayor con tabs:
- Topbar con **dos tabs**: "Reportes" (default) y "Configuración".
- Tab **Reportes** mantiene el layout 2-pane (lista a la izquierda, detalle a la derecha), ahora con acciones por fila:
  - ⬆️/⬇️ — mover arriba/abajo. Persiste el orden vía `POST /reorder`.
  - ✏️ — abre modal de edición con campos nombre y notas.
  - 🗑️ — abre modal de confirmación de eliminación.
  - ⌄/⌃ — expandir/colapsar inline el resumen + notas del reporte directamente en la fila, sin tener que abrir el detalle completo.
- El nombre del reporte se muestra como título principal cuando existe; si no, cae al timestamp.
- Las notas se muestran como nota ámbar en el panel de detalle.
- Skeleton loader (`ReportListSkeleton`) reemplaza al spinner crudo durante la carga.
- Tab **Configuración** = formulario completo del auditor (toggle, procedimientos, horario, email, WhatsApp, dispositivo), movido íntegramente desde `AgenteIA.jsx`.
- Botón "Auditar ahora" se deshabilita si la auditoría está apagada o no hay procedimientos configurados, con tooltip que apunta al tab Configuración.
- Animaciones `fadeIn` y `slideUp` para modales y secciones expandibles.
- Modal genérico reutilizable (`<Modal>`) con overlay oscuro y card centrada, soporta cierre por click-fuera.

**Frontend `AgenteIA.jsx`** — limpieza:
- Eliminada toda la sección JSX del auditor (244 líneas).
- Eliminados states: `auditEnabled`, `auditProcedures`, `auditEmail`, `auditWhatsappPhone`, `auditDispositivoId`, `horarioInicio`, `horarioFin`, `dispositivos`, `auditSaveStatus`, `auditRunning`, `auditResult`.
- Eliminado el `useEffect` de carga de config auditor y dispositivos.
- Eliminadas funciones `runAuditNow` y `saveAuditConfig`.
- Reemplazado por un comentario que apunta a `/auditoria` para evitar confusión a futuros mantenedores.

**Archivos modificados:**
- `Backend/src/db/migration/V7__ai_auditor_crud.sql` (nuevo)
- `Backend/src/model/AiAuditReport.java` (nuevos campos `nombre`, `notas`, `orden` + getters/setters)
- `Backend/src/repository/AiAuditReportRepository.java` (query JPQL con orden manual)
- `Backend/src/controller/AuditController.java` (3 endpoints CRUD + `toMap` extendido)
- `Frontend/src/pages/Auditoria.jsx` (refactor mayor con tabs + acciones por fila + subcomponentes)
- `Frontend/src/pages/AgenteIA.jsx` (sección auditor removida)

---

### Fase 8 — Mobile responsive + time picker mejorado

**Commit:** `feat(auditor-ia): fase 8`

**Cambios:**

**Hook `useIsMobile`** — interno a `Auditoria.jsx`, escucha `window.resize` y devuelve `true` cuando el viewport es < 768 px. Cleanup automático del listener.

**Layout responsive del tab Reportes:**
- Desktop (≥ 768 px) — mantiene el layout 2-pane: lista a la izquierda (320 px), detalle a la derecha.
- Mobile (< 768 px) — patrón de "drill-down" típico:
  - Sin reporte seleccionado → solo se ve la lista, ocupa todo el ancho.
  - Con reporte seleccionado → la lista se oculta y aparece el detalle full-width, con un botón **"← Volver al historial"** arriba para regresar.
- Esto evita el scroll horizontal y mantiene la legibilidad en pantallas pequeñas.

**Form de configuración responsive (`ConfigForm`):**
- Recibe la prop `isMobile`. En mobile aumenta `font-size` a `1rem` y `padding` a `12px 14px` para que los inputs sean cómodos al touch.
- Botón de guardado más alto en mobile (`13px` de padding vertical, `0.95rem` de fuente).
- Padding lateral de la página reducido en mobile para que el form respire bien.
- `inputMode="email"` / `inputMode="numeric"` en los campos correspondientes para que el teclado virtual del dispositivo se adapte.
- `autoComplete="email"` y `autoComplete="tel"` para sugerir valores guardados del navegador.

**Time picker con presets — `<TimeRangePicker>`:**
- Mantiene los dos inputs nativos `<input type="time">` (con buen soporte cross-platform).
- Debajo agrega 4 chips de preset rápidos: **Mañana** (08-13), **Tarde** (14-18), **Día completo** (09-18), **24 hs** (00-23:59).
- El chip activo (cuando el rango actual coincide con un preset) se resalta en violeta.
- Click en un chip aplica ambos valores de una sola vez.

**Validación inicio < fin:**
- Si `horarioInicio >= horarioFin`, se muestra un mensaje rojo bajo el picker: _"La hora de inicio debe ser menor a la de fin."_
- El botón "Guardar configuración" se deshabilita visualmente (opacity 0.5, cursor not-allowed) hasta que el rango sea válido.

**Polish complementario** (ya incorporado entre Fases 5-7, listado acá para inventario):
- Animaciones `fadeIn` (secciones expandibles, modales) y `slideUp` (entrada de modales) ya están en place.
- Skeleton loader (`ReportListSkeleton`) reemplaza el spinner crudo al cargar el historial.
- Badges con ícono + color por estado: ✅ Cumplido / ⚠️ Parcial / ❌ Incumplido (en procedimientos) y verde/amarillo/rojo en los chips del header.
- Tooltips (`title` attribute) en los campos del form vía componente `<Field>` con ícono `fa-circle-question`.
- Botones principales con `fa-spinner fa-spin` durante operaciones async (`saveConfig`, `runAudit`, `saveMeta`).
- Sistema de colores y tipografías ya alineado con el resto del dashboard (clase `db-root` con `--db-accent`, paleta violeta `#a78bfa`).

**Archivos modificados:**
- `Frontend/src/pages/Auditoria.jsx` — hook `useIsMobile`, layout drill-down en mobile, prop `isMobile` propagada a `ConfigForm`, componente `<TimeRangePicker>` con presets + validación, atributos `inputMode`/`autoComplete` en inputs.

---

## Configuración necesaria

No se requieren variables de entorno nuevas — el módulo usa las ya existentes:

| Variable | Uso |
|---|---|
| `OPENAI_API_KEY` | Llamadas a GPT-4o |
| `RESEND_API_KEY` | Envío del reporte por email |
| `APP_EMAIL_ENABLED` | `true` para activar el envío de emails |
| `APP_EMAIL_FROM` | Dirección remitente del reporte |

---

## Cómo probar localmente

1. Activar el auditor en **Agente IA → Auditor de procedimientos**
2. Escribir al menos un procedimiento, ej: _"Los vendedores deben responder en menos de 2 horas"_
3. Guardar la configuración
4. Ir a **Auditoría** en el sidebar → hacer click en **"Auditar ahora"**
5. Después de ~10–20 seg aparece el reporte inline con los hallazgos encontrados

Para probar el scheduler sin esperar a las 7am, cambiar temporalmente el cron en `AiAuditScheduler.java`:
```java
@Scheduled(cron = "0 * * * * *") // cada minuto
```

---

## Modelo de datos del hallazgo

Cada elemento del array `hallazgos_json` tiene esta estructura:

```json
{
  "tipo": "incumplimiento",
  "vendedor": "María",
  "cliente_id": 42,
  "regla_violada": "Respuesta en menos de 2 horas",
  "cita_textual": "Hola! Te paso los precios...",
  "severidad": "alta",
  "confianza": "alta",
  "descripcion": "El vendedor tardó 4 horas en responder al cliente.",
  "false_positive": false
}
```

`false_positive` se agrega dinámicamente cuando el usuario marca el hallazgo desde la UI. No viene del modelo de IA.
