# O'T CRM - Plataforma de Gestion Omnicanal

![Spring Boot](https://img.shields.io/badge/Spring_Boot-3.5-6DB33F?style=for-the-badge&logo=spring-boot&logoColor=white)
![Java](https://img.shields.io/badge/Java-21-ED8B00?style=for-the-badge&logo=openjdk&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.8+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Multi--Stage-2496ED?style=for-the-badge&logo=docker&logoColor=white)

**O'T CRM** es un SaaS (Software as a Service) empresarial que unifica la atencion al cliente a traves de multiples canales de mensajeria. Integra WhatsApp y Telegram en un tablero Kanban interactivo con chat en tiempo real, gestion de equipo, sistema de suscripciones y analiticas de negocio.

---

## Nuestra Historia

Este proyecto nacio del esfuerzo conjunto de dos amigos apasionados por la tecnologia. Durante **2 intensos meses (aprox. 8 horas diarias)**, construimos esta plataforma desde cero. Combinamos nuestros conocimientos previos, aprendizaje autodidacta a traves de documentacion y videos, y el uso estrategico de Inteligencia Artificial para acelerar el desarrollo y resolver problemas de arquitectura compleja. El resultado es un SaaS funcional, escalable y listo para produccion.

---

## Tabla de Contenidos

- [Caracteristicas Principales](#caracteristicas-principales)
- [Arquitectura del Sistema](#arquitectura-del-sistema)
- [Stack Tecnologico](#stack-tecnologico)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Backend en Detalle](#backend-en-detalle)
- [Frontend en Detalle](#frontend-en-detalle)
- [Bot de WhatsApp](#bot-de-whatsapp)
- [Bot de Telegram](#bot-de-telegram)
- [Sistema de Planes y Suscripciones](#sistema-de-planes-y-suscripciones)
- [Pasarelas de Pago](#pasarelas-de-pago)
- [Seguridad](#seguridad)
- [Despliegue con Docker](#despliegue-con-docker)
- [Guia de Instalacion Local](#guia-de-instalacion-local)
- [Variables de Entorno](#variables-de-entorno)
- [Creditos y Contacto](#creditos-y-contacto)

---

## Caracteristicas Principales

### CRM y Pipeline de Ventas
- **Tablero Kanban** con drag & drop para gestionar leads a traves de etapas personalizables (colores, orden, nombres).
- **Sistema de etiquetas** con colores para categorizar contactos.
- **Gestion de saldos/presupuestos** por cliente con operaciones de carga y retiro.
- **Notas y actividades** por contacto.
- **Busqueda global** avanzada por nombre, telefono y etiquetas.

### Mensajeria Omnicanal
- **WhatsApp** via Baileys (escaneo QR, envio/recepcion de texto, imagenes, videos, documentos, audio y stickers).
- **Telegram** via Telethon (multiples sesiones, soporte de media completo).
- **Chat unificado** en tiempo real con historial de conversaciones.
- **Respuestas rapidas** (templates predefinidos para agilizar la atencion).

### Tiempo Real
- **WebSockets (STOMP + SockJS)** para actualizaciones instantaneas en el Kanban, chat y notificaciones.
- **Presencia online/offline** de cada miembro del equipo.
- **Notificaciones de escritorio** y alertas de audio para mensajes nuevos.

### Equipo y Agencias
- **Sistema de agencias** con roles (Admin, Agente).
- **Solicitudes de union** a equipos con flujo de aprobacion.
- **Codigos de invitacion** para incorporar miembros.
- **Plan compartido**: el plan del Admin aplica a todo el equipo.

### Dashboard Analitico
- KPIs en tiempo real: leads del dia, mensajes sin leer, total de contactos.
- Monitoreo de dispositivos conectados.
- Estado de suscripcion y uso del plan.
- Vista de equipo con estado de presencia.

### Importacion/Exportacion
- **Importar contactos** desde archivos Excel (.xlsx/.xls) con validacion de plan.
- **Exportar contactos** a Excel.
- **Reportes de transacciones** exportables a Excel.

### Almacenamiento en la Nube
- Integracion con **Cloudinary** para imagenes, documentos y archivos multimedia.
- Generacion de **codigos QR** para vinculacion de dispositivos.

---

## Arquitectura del Sistema

El proyecto sigue una arquitectura de **microservicios distribuidos** orquestados con Docker Compose:

```
                    +------------------+
                    |    Frontend      |
                    |   React 19 SPA   |
                    |   (Vite Build)   |
                    +--------+---------+
                             |
                     HTTPS / WSS
                             |
              +--------------+--------------+
              |      Backend (Java 21)      |
              |      Spring Boot 3.5        |
              |  REST API + WebSocket STOMP  |
              |      PostgreSQL (JPA)        |
              +---------+----------+--------+
                        |          |
            Webhooks HTTP|          |Webhooks HTTP
                        |          |
              +---------+--+  +----+----------+
              | Bot WhatsApp|  | Bot Telegram  |
              | Node.js 20  |  | Python 3.8+   |
              | Baileys     |  | Telethon      |
              | Socket.io   |  | Flask         |
              +-------------+  +---------------+
```

**Flujo de datos:**
1. Los bots reciben mensajes de WhatsApp/Telegram.
2. Envian los datos al backend via webhooks HTTP autenticados con `BOT_SECRET_KEY`.
3. El backend procesa, persiste en PostgreSQL y notifica al frontend via WebSocket.
4. El frontend actualiza el Kanban, chat y notificaciones en tiempo real.

---

## Stack Tecnologico

| Capa | Tecnologia | Version |
|------|-----------|---------|
| **Backend** | Java + Spring Boot | 21 / 3.5.10 |
| **Frontend** | React + Vite | 19.2 / 8.0 |
| **Base de Datos** | PostgreSQL + Hibernate | 16+ |
| **Bot WhatsApp** | Node.js + Baileys + Express | 20+ |
| **Bot Telegram** | Python + Telethon + Flask | 3.8+ |
| **WebSockets** | STOMP + SockJS | - |
| **Autenticacion** | JWT (JJWT 0.11.5) + Spring Security | - |
| **Pagos** | MercadoPago API + PayPal SDK | - |
| **Email** | Resend API | 3.1.0 |
| **Archivos** | Cloudinary SDK | 1.36.0 |
| **Excel** | Apache POI | 5.2.5 |
| **QR Code** | ZXing | 3.5.1 |
| **Contenedores** | Docker + Docker Compose | - |
| **Hosting** | Railway | - |
| **DNS/CDN** | Cloudflare | - |

---

## Estructura del Proyecto

```
OT-crm/
|-- Backend/
|   |-- src/
|       |-- config/          # WebSocket, MVC, Security, Properties
|       |-- controller/      # 21 REST controllers
|       |-- dto/             # Data Transfer Objects
|       |-- exception/       # Excepciones custom
|       |-- initializer/     # DataInitializer (planes, admin, etapas)
|       |-- listener/        # WebSocket presence events
|       |-- model/           # 11 entidades JPA
|       |-- repository/      # 11 repositorios Spring Data
|       |-- security/        # JWT, filtros, interceptores
|       |-- service/         # 20 servicios de logica de negocio
|       |-- application.properties
|
|-- Frontend/
|   |-- src/
|       |-- components/      # KanbanCard, ChatModal, Sidebar, etc.
|       |-- context/         # ToastContext
|       |-- hooks/           # useWebSocket, useAudio
|       |-- pages/           # 11 paginas (Auth, Dashboard, Kanban, etc.)
|       |-- utils/           # api.js (Axios config)
|       |-- App.jsx          # Rutas principales
|
|-- Bot-Whatsapp/
|   |-- index.js             # Servidor Express + Baileys
|   |-- package.json
|   |-- Dockerfile
|
|-- Bot-Telegram/
|   |-- telegram_bridge.py   # Flask + Telethon bridge
|   |-- requirements.txt
|
|-- Dockerfile               # Multi-stage (React + Maven + Runtime)
|-- docker-compose.yml       # Orquestacion de servicios
|-- pom.xml                  # Dependencias Maven
|-- .env.example             # Template de variables de entorno
|-- .gitignore
```

---

## Backend en Detalle

### Controllers (21 endpoints)

| Controller | Ruta Base | Descripcion |
|-----------|-----------|-------------|
| `AuthController` | `/api/v1/auth` | Login, registro, verificacion de email, recuperacion de contrasena |
| `ClienteController` | `/api/v1/contactos`, `/api/v1/clientes` | CRUD de contactos, importar/exportar Excel, etiquetas, saldos |
| `ChatController` | `/api/v1/chat` | Historial de mensajes, envio de mensajes, subida de archivos |
| `WhatsAppController` | `/api/v1/whatsapp` | QR, conexion de dispositivos, estado de instancias |
| `TelegramDispositivoController` | `/api/v1/telegram` | Setup y validacion de dispositivos Telegram |
| `WhatsAppWebhookController` | `/api/webhook/whatsapp` | Receptor de webhooks del bot Node.js |
| `TelegramWebhookController` | `/api/telegram` | Receptor de webhooks del bot Python |
| `DashboardRestController` | `/api/v1/dashboard` | KPIs en tiempo real, gestion de equipo |
| `MercadoPagoController` | `/api/v1/mp`, `/api/mp` | Suscripciones y webhooks de MercadoPago |
| `PayPalController` | `/api/v1/paypal` | Creacion de suscripciones PayPal |
| `PayPalWebhookController` | `/api/paypal/webhook` | Webhooks de PayPal |
| `PlanController` | `/api/v1/planes` | CRUD de planes, info de suscripcion |
| `EtapaController` | `/api/v1/etapas` | Gestion de etapas del pipeline |
| `RespuestaRapidaController` | `/api/v1/respuestas-rapidas` | Templates de respuestas rapidas |
| `PerfilController` | `/api/v1/perfil` | Perfil de usuario, cambio de contrasena |
| `AgenciaController` | `/api/v1/agencia` | Gestion de agencia/organizacion |
| `PresenceController` | `/api/v1/presence` | Presencia online/offline via WebSocket |
| `ReporteController` | `/api/v1/reportes` | Reportes y analiticas |
| `TransaccionApiController` | `/api/v1/transacciones` | Transacciones financieras por cliente |
| `TableroSocketController` | WebSocket | Actualizaciones en tiempo real del tablero |
| `SpaController` | `/**` | Sirve el index.html del SPA para rutas del frontend |

### Modelos (11 entidades JPA)

| Entidad | Descripcion |
|---------|-------------|
| `Usuario` | Usuario con rol, verificacion de email, plan, agencia |
| `Agencia` | Organizacion con multiples usuarios, dispositivos y clientes |
| `Cliente` | Lead/contacto con telefono, etapa, etiquetas, saldo, historial |
| `Dispositivo` | Dispositivo WhatsApp/Telegram con estado de conexion |
| `Etapa` | Etapa del pipeline (orden, color, flag de inicial) |
| `Mensaje` | Mensaje con contenido, timestamp, archivo adjunto, estado de entrega |
| `Plan` | Plan de suscripcion (FREE, PRO, BUSINESS, ENTERPRISE) |
| `Transaccion` | Transaccion financiera vinculada a cliente y usuario |
| `Etiqueta` | Sistema de tags con colores para clientes |
| `RespuestaRapida` | Templates de respuestas predefinidas |
| `SolicitudUnionEquipo` | Solicitudes de ingreso a un equipo |

### Servicios Clave (20 servicios)

| Servicio | Responsabilidad |
|----------|-----------------|
| `WhatsAppService` | Procesamiento de mensajes WA, sincronizacion de clientes, archivos |
| `TelegramBridgeService` | Puente entre bot Python y backend Java |
| `ChatService` | Historial de chat, organizacion de mensajes |
| `UsuarioService` | Registro, verificacion de email (codigos), recuperacion de contrasena |
| `DashboardService` | Agregacion de KPIs (leads, mensajes sin leer, contactos) |
| `PlanService` | Activacion/expiracion de planes, upgrades/downgrades |
| `SubscriptionValidationService` | Enforcement de limites (contactos, dispositivos) |
| `PlanPriceScheduler` | Sincronizacion automatica de precios con MercadoPago |
| `EmailService` | Emails transaccionales via Resend API |
| `CloudStorageService` | Uploads a Cloudinary (imagenes, documentos, media) |
| `ExcelService` | Importacion/exportacion de contactos y reportes en .xlsx |
| `QrCodeService` | Generacion de codigos QR para vincular dispositivos |

### WebSocket

- **Endpoint:** `/ws-crm` (SockJS + STOMP)
- **Canales de broadcast:**
  - `/topic/agencia/{agenciaId}` - Eventos de la agencia (nuevos mensajes, clientes actualizados, etc.)
  - `/topic/embudo/{agenciaId}` - Cambios en el pipeline/Kanban
  - `/topic/global-notifications` - Notificaciones del sistema
- **Heartbeat** configurable para mantener conexiones activas
- **Interceptor de presencia** para tracking online/offline

---

## Frontend en Detalle

### Paginas (11 vistas)

| Pagina | Ruta | Descripcion |
|--------|------|-------------|
| `Auth.jsx` | `/` | Login, registro, verificacion de email, recuperacion de contrasena |
| `Dashboard.jsx` | `/dashboard` | KPIs, equipo, presencia, estado de dispositivos |
| `Kanban.jsx` | `/kanban` | Tablero drag & drop con chat integrado |
| `Contactos.jsx` | `/contactos` | Lista de contactos, importar/exportar Excel, busqueda |
| `WhatsAppVincular.jsx` | `/vincular-whatsapp` | Vincular dispositivo WhatsApp via QR |
| `TelegramVincular.jsx` | `/vincular-telegram` | Conectar bot de Telegram |
| `Planes.jsx` | `/planes` | Comparacion y seleccion de planes |
| `Checkout.jsx` | `/checkout` | Procesamiento de pagos |
| `MiSuscripcion.jsx` | `/mi-suscripcion` | Detalles de plan actual, miembros del equipo |
| `RespuestasRapidas.jsx` | `/respuestas-rapidas` | Gestion de templates de respuestas |
| `Perfil.jsx` | `/perfil` | Perfil, cambio de contrasena, avatar |

### Componentes Clave

- **KanbanCard / KanbanColumn** - Tarjetas y columnas del pipeline con drag & drop
- **ChatModal** - Interfaz de chat integrada con emoji picker y subida de archivos
- **SlashCommandMenu** - Menu de comandos rapidos (/)
- **NotificationBell** - Campana de notificaciones con contador
- **Sidebar** - Navegacion principal con indicadores de estado
- **MainLayout** - Shell de la aplicacion autenticada

### Librerias Frontend

| Libreria | Uso |
|----------|-----|
| `react-router-dom` | Routing SPA |
| `axios` | Cliente HTTP con JWT auto-inject |
| `@stomp/stompjs` | Cliente WebSocket STOMP |
| `sockjs-client` | Fallback para WebSocket |
| `emoji-picker-react` | Selector de emojis en el chat |

---

## Bot de WhatsApp

**Stack:** Node.js 20+ / Express / Baileys / Socket.io

### Funcionalidades

- **Autenticacion QR:** Endpoint `/auth/qr` genera el codigo QR para escanear con WhatsApp.
- **Sesiones persistentes:** Los datos de autenticacion se guardan en `auth_info_v2/` (volume Docker).
- **Multi-dispositivo:** Soporte para multiples instancias de WhatsApp simultaneas.
- **Tipos de mensaje soportados:** Texto, imagenes, videos, audio, documentos, stickers.
- **Cola de mensajes:** Una cola por JID para prevenir race conditions.
- **Deduplicacion:** Cache de 5 minutos para evitar mensajes duplicados.
- **Webhook:** Envia mensajes entrantes al backend Java via POST autenticado con `BOT_SECRET_KEY`.

---

## Bot de Telegram

**Stack:** Python 3.8+ / Flask / Telethon / httpx

### Funcionalidades

- **Multi-sesion:** Diccionario de clientes activos para sesiones concurrentes.
- **Procesamiento de media:** Deteccion automatica del tipo (foto, video, audio, documento, sticker, voz).
- **Fotos de perfil:** Descarga y cache automatica de avatares de contactos.
- **Webhook:** Envia mensajes entrantes al backend Java via POST autenticado.

---

## Sistema de Planes y Suscripciones

### Planes Disponibles

| Plan | Dispositivos | Contactos | Precio (ARS/mes) | Descripcion |
|------|-------------|-----------|-------------------|-------------|
| **FREE** | 1 | 25 | $0 | Plan gratuito para pruebas |
| **PRO** | 5 | 75 | $15.000 | Para equipos de ventas en crecimiento |
| **BUSINESS** | 10 | 250 | $30.000 | Para agencias consolidadas |
| **ENTERPRISE** | Ilimitado | Ilimitado | $60.000 | Plan VIP sin restricciones |

### Que se limita

- **Dispositivos conectados:** Al intentar vincular un dispositivo que excede el limite, se retorna HTTP 402 (Payment Required).
- **Contactos unicos:** Cuando un nuevo contacto escribe por WhatsApp/Telegram y se alcanzo el limite, se rechaza y se notifica al usuario via WebSocket.
- **Importacion de contactos:** Si una importacion de Excel superaria el limite de contactos del plan, se rechaza la importacion completa con un mensaje descriptivo.
- **Mensajes:** Son ilimitados en todos los planes.

### Logica de Equipo

El plan del usuario con rol **ADMIN** aplica a todos los miembros de la agencia. Al hacer downgrade, los dispositivos excedentes se desconectan automaticamente.

---

## Pasarelas de Pago

### MercadoPago

- Suscripciones mensuales recurrentes en ARS.
- El usuario es redirigido al `init_point` de MercadoPago para completar el pago.
- Webhooks procesan eventos: `subscription_authorized_payment`, `subscription_preapproval`.
- Sincronizacion automatica de precios via `PlanPriceScheduler`.

### PayPal

- Suscripciones via REST API con OAuth2.
- Webhooks escuchan: `BILLING.SUBSCRIPTION.ACTIVATED`, `BILLING.SUBSCRIPTION.CANCELLED`, `BILLING.SUBSCRIPTION.EXPIRED`, `BILLING.SUBSCRIPTION.SUSPENDED`.
- Soporte para modo sandbox y produccion.

### Flujo General

1. El usuario selecciona un plan en `/planes`.
2. Se crea la suscripcion en MercadoPago o PayPal.
3. El usuario completa el pago en la pasarela.
4. Un webhook confirma el pago y activa el plan por 1 mes.
5. Al cancelar o expirar, el usuario baja automaticamente a FREE.

---

## Seguridad

### Autenticacion y Autorizacion

- **JWT (JSON Web Tokens)** con expiracion de 10 horas.
- **BCrypt** para hash de contrasenas.
- **Spring Security** con sesiones stateless.
- **Verificacion de email** con codigos de 6 digitos.
- **Recuperacion de contrasena** via email con tokens temporales.

### Proteccion de Endpoints

- **Publicos:** `/api/v1/auth/**`, `/api/webhook/**`, `/api/telegram/**`, webhooks de pago.
- **Protegidos:** Todos los demas endpoints requieren JWT valido.
- **CORS:** Whitelist de origenes permitidos.

### Webhooks

- Autenticacion bot-to-backend via `BOT_SECRET_KEY` en headers.
- Validacion de payloads en webhooks de MercadoPago y PayPal.

### Gestion de Secretos

- Arquitectura **Zero Trust** basada en la metodologia 12-Factor App.
- Ninguna credencial existe en el codigo fuente; todo se inyecta via variables de entorno.
- Archivo `.env.example` como template sin valores reales.

---

## Despliegue con Docker

### Dockerfile (Multi-stage Build)

El Dockerfile principal utiliza 3 etapas para optimizar el tamano de la imagen:

```dockerfile
# Etapa 1: Build del frontend React con Node 20
FROM node:20-alpine AS frontend

# Etapa 2: Build del backend Java con Maven
FROM maven:3.9.6-eclipse-temurin-21 AS backend

# Etapa 3: Runtime minimo con Alpine
FROM eclipse-temurin:21-jre-alpine
```

El frontend se compila y se sirve como archivos estaticos desde Spring Boot en un unico puerto (8080).

### Docker Compose

```bash
docker-compose up --build
```

Levanta 2 servicios:
- **backend** (puerto 8080) - Spring Boot + React estatifico
- **Bot-Whatsapp** (puerto 3000) - Bot de WhatsApp con volumen persistente para sesiones

### Infraestructura Cloud

- **Railway:** Hosting con escalabilidad horizontal, variables de entorno inyectadas y volumenes persistentes.
- **Cloudflare:** DNS, proxy inverso, cache perimetral y proteccion DDoS.

---

## Guia de Instalacion Local

### Requisitos Previos

- Docker y Docker Compose
- Java 21 (opcional, si se corre fuera de Docker)
- Node.js 20+ (opcional, para desarrollo del bot)
- Python 3.8+ (opcional, para el bot de Telegram)
- PostgreSQL 16+ (o usar uno remoto)

### Paso a paso

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/fabrithompson/ot-crm.git
   cd ot-crm
   ```

2. **Configurar variables de entorno:**
   ```bash
   cp .env.example .env
   ```
   Edita `.env` y completa todas las credenciales requeridas.

3. **Levantar con Docker:**
   ```bash
   docker-compose up --build
   ```

4. **Acceder a la aplicacion:**
   - URL: `http://localhost:8080`
   - Credenciales por defecto: `admin` / (la que configures en `APP_DEFAULT_ADMIN_PASSWORD`)

---

## Variables de Entorno

Todas las variables necesarias estan documentadas en `.env.example`:

| Variable | Descripcion | Requerida |
|----------|-------------|-----------|
| `SPRING_DATASOURCE_URL` | URL de conexion PostgreSQL (jdbc:postgresql://...) | Si |
| `SPRING_DATASOURCE_USERNAME` | Usuario de la base de datos | Si |
| `SPRING_DATASOURCE_PASSWORD` | Contrasena de la base de datos | Si |
| `JWT_SECRET` | Clave secreta para firmar tokens JWT | Si |
| `BOT_SECRET_KEY` | Clave compartida para autenticacion bot-backend | Si |
| `NODE_BOT_URL` | URL del bot de WhatsApp | Si |
| `APP_DEFAULT_ADMIN_PASSWORD` | Contrasena del admin por defecto | Si |
| `APP_BASE_URL` | URL base de la aplicacion | Si |
| `MERCADOPAGO_ACCESS_TOKEN` | Token de acceso de MercadoPago | Si |
| `PAYPAL_CLIENT_ID` | Client ID de PayPal | Si |
| `PAYPAL_CLIENT_SECRET` | Client Secret de PayPal | Si |
| `PAYPAL_MODE` | Modo de PayPal (`sandbox` o `live`) | No |
| `CLOUDINARY_CLOUD_NAME` | Nombre del cloud en Cloudinary | Si |
| `CLOUDINARY_API_KEY` | API Key de Cloudinary | Si |
| `CLOUDINARY_API_SECRET` | API Secret de Cloudinary | Si |
| `RESEND_API_KEY` | API Key de Resend para emails | Si |
| `APP_EMAIL_ENABLED` | Habilitar envio de emails (`true`/`false`) | No |
| `TELEGRAM_API_ID` | API ID de Telegram (para el bot) | Si* |
| `TELEGRAM_API_HASH` | API Hash de Telegram (para el bot) | Si* |

*Requeridas solo si se despliega el bot de Telegram.

---

## Creditos y Contacto

Desarrollado con dedicacion por:

- **Fabricio Thompson** - [fabrithompson](https://github.com/fabrithompson) - fabriciothompson16@gmail.com
- **Ivan O'Connor** - [IvanOCNN](https://github.com/IvanOCNN) - ivanoconnor28@gmail.com

Para consultas empresariales, despliegues personalizados o dudas tecnicas, no dudes en contactarnos.
