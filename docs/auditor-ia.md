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
