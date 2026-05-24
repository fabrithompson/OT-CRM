package service;

import java.io.IOException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import model.Agencia;
import model.ContactoCampania;
import model.Dispositivo;
import model.EnvioCampania;
import model.MensajeCampania;
import model.PlantillaCampania;
import repository.ContactoCampaniaRepository;
import repository.DispositivoRepository;
import repository.EnvioCampaniaRepository;
import repository.MensajeCampaniaRepository;
import repository.PlantillaCampaniaRepository;

/**
 * Lógica del módulo de campañas (envío masivo). Aislado del flujo del embudo
 * principal: ningún método toca {@code clientes} ni {@code mensajes}.
 *
 * El worker {@link #procesarColaPendiente()} corre cada 5 segundos y procesa
 * la cola de envíos respetando un delay aleatorio 8–30s entre envíos del
 * mismo dispositivo (mitiga el riesgo de baneo). Si la última hora dejó al
 * device por encima del límite diario, se saltea.
 */
@Service
public class CampaniaService {

    private static final Logger log = LoggerFactory.getLogger(CampaniaService.class);

    // ── Configuración anti-ban ────────────────────────────────────────────────
    private static final long DELAY_MIN_MS = 25_000L;
    private static final long DELAY_MAX_MS = 60_000L;
    private static final int  LIMITE_DIARIO_POR_DISPOSITIVO = 100;
    private static final int  SKIP_DIAS = 30;
    private static final ZoneId ZONE_AR = ZoneId.of("America/Argentina/Buenos_Aires");

    private final ContactoCampaniaRepository contactoRepo;
    private final PlantillaCampaniaRepository plantillaRepo;
    private final EnvioCampaniaRepository envioRepo;
    private final MensajeCampaniaRepository mensajeRepo;
    private final DispositivoRepository dispositivoRepo;
    private final SimpMessagingTemplate messaging;
    private final BotHttpClient botClient;
    private CalentamientoService calentamientoService;

    /**
     * Por sessionId, el timestamp epoch-ms del próximo momento en que se
     * permite enviar otro mensaje desde ese dispositivo. Se resetea con un
     * delay aleatorio cada vez que se manda algo.
     */
    private final Map<String, Long> proximoEnvioPermitido = new ConcurrentHashMap<>();

    public CampaniaService(ContactoCampaniaRepository contactoRepo,
                           PlantillaCampaniaRepository plantillaRepo,
                           EnvioCampaniaRepository envioRepo,
                           MensajeCampaniaRepository mensajeRepo,
                           DispositivoRepository dispositivoRepo,
                           SimpMessagingTemplate messaging,
                           BotHttpClient botClient) {
        this.contactoRepo = contactoRepo;
        this.plantillaRepo = plantillaRepo;
        this.envioRepo = envioRepo;
        this.mensajeRepo = mensajeRepo;
        this.dispositivoRepo = dispositivoRepo;
        this.messaging = messaging;
        this.botClient = botClient;
    }

    // Setter injection para romper dependencia circular (CalentamientoService → CampaniaService nunca)
    @org.springframework.beans.factory.annotation.Autowired
    public void setCalentamientoService(CalentamientoService calentamientoService) {
        this.calentamientoService = calentamientoService;
    }

    // ════════════════════════════════════════════════════════════════════════
    // CONTACTOS
    // ════════════════════════════════════════════════════════════════════════

    @Transactional
    public Map<String, Object> importarContactosDesdeExcel(Dispositivo dispositivo,
                                                            Agencia agencia,
                                                            MultipartFile file) throws IOException {
        if (dispositivo.getProposito() != Dispositivo.Proposito.CAMPANIAS) {
            throw new IllegalArgumentException("El dispositivo no es de tipo CAMPANIAS");
        }

        int importados = 0;
        int duplicados = 0;
        int invalidos = 0;

        try (Workbook workbook = WorkbookFactory.create(file.getInputStream())) {
            Sheet sheet = workbook.getSheetAt(0);
            Iterator<Row> rows = sheet.iterator();
            if (rows.hasNext()) rows.next(); // saltar header

            while (rows.hasNext()) {
                Row row = rows.next();
                String nombre = leerCelda(row.getCell(0), false);
                String telefono = leerCelda(row.getCell(1), true);

                // Soporte para Excel de una sola columna (solo números de teléfono)
                if (telefono.length() < 10 && !nombre.isBlank()) {
                    String soloDigitos = nombre.replaceAll("\\D", "");
                    if (soloDigitos.length() >= 10) {
                        telefono = soloDigitos;
                        nombre = soloDigitos;
                    }
                }

                if (telefono == null || telefono.length() < 10) {
                    invalidos++;
                    continue;
                }
                if (nombre == null || nombre.isBlank()) {
                    nombre = "Sin nombre";
                }

                Optional<ContactoCampania> existente =
                        contactoRepo.findByDispositivoIdAndTelefono(dispositivo.getId(), telefono);
                if (existente.isPresent()) {
                    duplicados++;
                    continue;
                }

                ContactoCampania c = new ContactoCampania();
                c.setNombre(nombre.trim());
                c.setTelefono(telefono);
                c.setDispositivo(dispositivo);
                c.setAgencia(agencia);
                contactoRepo.save(c);
                importados++;
            }
        }

        log.info("Importación campaña device={} importados={} duplicados={} invalidos={}",
                dispositivo.getId(), importados, duplicados, invalidos);

        return Map.of(
                "importados", importados,
                "duplicados", duplicados,
                "invalidos", invalidos
        );
    }

    @Transactional(readOnly = true)
    public List<ContactoCampania> listarContactos(Long dispositivoId) {
        return contactoRepo.findByDispositivoIdOrderByFechaImportadoDesc(dispositivoId);
    }

    @SuppressWarnings("null")
    @Transactional
    public void eliminarContacto(Long contactoId, Long agenciaId) {
        contactoRepo.findById(contactoId)
                .filter(c -> c.getAgencia().getId().equals(agenciaId))
                .ifPresent(contactoRepo::delete);
    }

    // ════════════════════════════════════════════════════════════════════════
    // PLANTILLAS
    // ════════════════════════════════════════════════════════════════════════

    @Transactional
    public PlantillaCampania crearPlantilla(Agencia agencia, String nombre, String cuerpo) {
        PlantillaCampania p = new PlantillaCampania();
        p.setNombre(nombre);
        p.setCuerpo(cuerpo);
        p.setAgencia(agencia);
        return plantillaRepo.save(p);
    }

    @Transactional(readOnly = true)
    public List<PlantillaCampania> listarPlantillas(Long agenciaId) {
        return plantillaRepo.findByAgenciaIdOrderByFechaCreacionDesc(agenciaId);
    }

    @SuppressWarnings("null")
    @Transactional
    public void eliminarPlantilla(Long plantillaId, Long agenciaId) {
        plantillaRepo.findById(plantillaId)
                .filter(p -> p.getAgencia().getId().equals(agenciaId))
                .ifPresent(plantillaRepo::delete);
    }

    // ════════════════════════════════════════════════════════════════════════
    // ENVÍO MASIVO
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Encola una campaña: por cada contacto crea un EnvioCampania PENDING
     * con el texto ya renderizado. Los contactos a los que ya se les envió
     * algo en los últimos {@value #SKIP_DIAS} días se saltan (estado SKIPPED).
     *
     * @return resumen {encolados, salteados}
     */
    @SuppressWarnings("null")
    @Transactional
    public Map<String, Object> encolarCampania(Dispositivo dispositivo,
                                               Agencia agencia,
                                               List<Long> contactoIds,
                                               String cuerpoPlantilla,
                                               PlantillaCampania plantilla) {
        if (dispositivo.getProposito() != Dispositivo.Proposito.CAMPANIAS) {
            throw new IllegalArgumentException("El dispositivo no es de tipo CAMPANIAS");
        }

        LocalDateTime hace30Dias = LocalDateTime.now().minusDays(SKIP_DIAS);
        int encolados = 0;
        int salteados = 0;

        for (Long contactoId : contactoIds) {
            Optional<ContactoCampania> opt = contactoRepo.findById(contactoId);
            if (opt.isEmpty()) continue;
            ContactoCampania c = opt.get();

            // Sanity: el contacto debe pertenecer al mismo device + agencia
            if (!c.getDispositivo().getId().equals(dispositivo.getId())) continue;
            if (!c.getAgencia().getId().equals(agencia.getId())) continue;

            EnvioCampania e = new EnvioCampania();
            e.setContacto(c);
            e.setDispositivo(dispositivo);
            e.setAgencia(agencia);
            e.setPlantilla(plantilla);
            e.setTextoRenderizado(renderizar(cuerpoPlantilla, c));

            if (envioRepo.existsRecentByContactoSince(c.getId(), hace30Dias)) {
                e.setEstado(EnvioCampania.Estado.SKIPPED);
                e.setErrorMsg("Contacto recibió mensaje en los últimos " + SKIP_DIAS + " días");
                salteados++;
            } else {
                encolados++;
            }
            envioRepo.save(e);
        }

        log.info("Campaña encolada: device={} encolados={} salteados={}",
                dispositivo.getId(), encolados, salteados);

        return Map.<String, Object>of("encolados", encolados, "salteados", salteados);
    }

    /**
     * Reemplaza variables soportadas en una plantilla.
     * Por ahora solo {nombre}. Es ASCII-safe y no escapa nada porque WhatsApp
     * trata todo como texto plano.
     */
    private String renderizar(String plantilla, ContactoCampania contacto) {
        if (plantilla == null) return "";
        return plantilla.replace("{nombre}", contacto.getNombre());
    }

    // ── Worker: procesa la cola PENDING con throttling ────────────────────────
    @Scheduled(fixedDelay = 5_000L)
    public void procesarColaPendiente() {
        // Una sola transacción por tick para no bloquear conexiones
        try {
            procesarTick();
        } catch (Exception ex) {
            log.error("Error en worker de campañas: {}", ex.getMessage(), ex);
        }
    }

    @SuppressWarnings("null")
    @Transactional
    public void procesarTick() {
        long ahora = System.currentTimeMillis();
        LocalDateTime inicioDia = LocalDate.now(ZONE_AR).atStartOfDay();

        // Lote FIFO de PENDING — eager-fetch de relaciones para evitar N+1
        List<EnvioCampania> pendientes = envioRepo.findPendingBatch(PageRequest.of(0, 50));

        for (EnvioCampania envio : pendientes) {
            Dispositivo d = envio.getDispositivo();
            String sessionId = d.getSessionId();

            // Respetar el delay aleatorio del device
            Long permitidoDesde = proximoEnvioPermitido.get(sessionId);
            if (permitidoDesde != null && ahora < permitidoDesde) {
                continue;
            }

            // Respetar el rate-limit diario
            long enviadosHoy = envioRepo.countSentByDispositivoSince(d.getId(), inicioDia);
            if (enviadosHoy >= LIMITE_DIARIO_POR_DISPOSITIVO) {
                continue;
            }

            // Verificar que el device esté conectado antes de intentar
            if (!"CONNECTED".equalsIgnoreCase(d.getEstado())) {
                continue;
            }

            boolean ok = enviarAlBot(d, envio.getContacto().getTelefono(), envio.getTextoRenderizado());
            if (ok) {
                envio.setEstado(EnvioCampania.Estado.SENT);
                envio.setFechaEnviado(LocalDateTime.now());
            } else {
                envio.setEstado(EnvioCampania.Estado.FAILED);
                envio.setErrorMsg("Bot devolvió error o sin respuesta");
            }
            envioRepo.save(envio);

            // Programamos el próximo envío permitido para este device
            long delay = ThreadLocalRandom.current().nextLong(DELAY_MIN_MS, DELAY_MAX_MS + 1);
            proximoEnvioPermitido.put(sessionId, ahora + delay);
            ahora = System.currentTimeMillis(); // refresca para los siguientes del mismo tick

            // Notificar al frontend
            if (d.getAgencia() != null) {
                messaging.convertAndSend("/topic/campania/" + d.getAgencia().getId(),
                        Map.<String, Object>of("tipo", "ENVIO_PROCESADO",
                               "envioId", envio.getId(),
                               "deviceId", d.getId(),
                               "contactoId", envio.getContacto().getId(),
                               "estado", envio.getEstado().name()));
            }
        }
    }

    private boolean enviarAlBot(Dispositivo dispositivo, String telefono, String texto) {
        // BotHttpClient devuelve el id del mensaje (waId) o null si el envío falló.
        return botClient.sendText(dispositivo.getSessionId(), telefono, texto) != null;
    }

    // ════════════════════════════════════════════════════════════════════════
    // CHATS (bandeja + mensajes)
    // ════════════════════════════════════════════════════════════════════════

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listarBandeja(Long dispositivoId) {
        List<Object[]> rows = mensajeRepo.findBandejaByDispositivo(dispositivoId);
        if (rows.isEmpty()) return Collections.emptyList();

        List<Map<String, Object>> bandeja = new ArrayList<>(rows.size());
        for (Object[] r : rows) {
            Long contactoId = ((Number) r[0]).longValue();
            Optional<ContactoCampania> c = contactoRepo.findById(contactoId);
            if (c.isEmpty()) continue;

            Map<String, Object> item = new HashMap<>();
            item.put("contactoId", contactoId);
            item.put("nombre", c.get().getNombre());
            item.put("telefono", c.get().getTelefono());
            item.put("ultimaFecha", r[1]);
            item.put("noLeidos", ((Number) r[2]).longValue());
            bandeja.add(item);
        }
        return bandeja;
    }

    @SuppressWarnings("null")
    @Transactional
    public List<MensajeCampania> listarMensajes(Long contactoId, Long agenciaId) {
        ContactoCampania c = contactoRepo.findById(contactoId)
                .filter(x -> x.getAgencia().getId().equals(agenciaId))
                .orElseThrow(() -> new IllegalArgumentException("Contacto no encontrado"));
        List<MensajeCampania> mensajes = mensajeRepo.findByContactoIdOrderByFechaAsc(c.getId());
        int marcados = mensajeRepo.marcarLeidosByContacto(c.getId());
        // Notificar a la agencia (otros browsers/usuarios del equipo) que el contacto
        // pasó a leído, así pueden bajar el contador no leídos sin recargar.
        if (marcados > 0 && c.getAgencia() != null) {
            messaging.convertAndSend("/topic/campania/" + c.getAgencia().getId(),
                    Map.<String, Object>of("tipo", "MENSAJE_LEIDO",
                           "contactoId", c.getId(),
                           "marcados", marcados));
        }
        return mensajes;
    }

    /**
     * Respuesta manual del operador a un contacto de campaña.
     * No pasa por la cola: se envía inmediatamente (no es spam, es 1-a-1).
     */
    @SuppressWarnings("null")
    @Transactional
    public MensajeCampania responderManual(Long contactoId, Long agenciaId, String texto) {
        ContactoCampania c = contactoRepo.findById(contactoId)
                .filter(x -> x.getAgencia().getId().equals(agenciaId))
                .orElseThrow(() -> new IllegalArgumentException("Contacto no encontrado"));

        boolean ok = enviarAlBot(c.getDispositivo(), c.getTelefono(), texto);
        if (!ok) {
            throw new RuntimeException("No se pudo enviar el mensaje (bot offline o error)");
        }

        MensajeCampania m = new MensajeCampania();
        m.setContacto(c);
        m.setDispositivo(c.getDispositivo());
        m.setTexto(texto);
        m.setDireccion(MensajeCampania.Direccion.OUT);
        m.setLeido(true);
        m = mensajeRepo.save(m);

        if (c.getAgencia() != null) {
            messaging.convertAndSend("/topic/campania/" + c.getAgencia().getId(),
                    Map.<String, Object>of("tipo", "MENSAJE_OUT", "contactoId", c.getId()));
        }
        return m;
    }

    /**
     * Entry point para el webhook entrante cuando el device es CAMPANIAS.
     * Crea el contacto si no existía (puede pasar si el destinatario responde
     * antes de que el bot reciba el ACK de envío, o si alguien le escribe sin
     * que figure en la lista importada).
     */
    @SuppressWarnings("null")
    @Transactional
    public void procesarMensajeEntrante(Dispositivo dispositivo,
                                        String telefonoFrom,
                                        String nombre,
                                        String texto) {
        if (dispositivo.getProposito() != Dispositivo.Proposito.CAMPANIAS) return;

        // Si el mensaje viene de otro dispositivo propio (calentamiento), intentar auto-responder.
        // El mensaje siempre se guarda en la bandeja para que sea visible.
        if (calentamientoService != null) {
            calentamientoService.intentarAutorespuesta(dispositivo.getId(), telefonoFrom);
        }

        ContactoCampania c = contactoRepo
                .findByDispositivoIdAndTelefono(dispositivo.getId(), telefonoFrom)
                .orElseGet(() -> {
                    ContactoCampania nuevo = new ContactoCampania();
                    nuevo.setNombre(nombre != null && !nombre.isBlank() ? nombre : telefonoFrom);
                    nuevo.setTelefono(telefonoFrom);
                    nuevo.setDispositivo(dispositivo);
                    nuevo.setAgencia(dispositivo.getAgencia());
                    return contactoRepo.save(nuevo);
                });

        MensajeCampania m = new MensajeCampania();
        m.setContacto(c);
        m.setDispositivo(dispositivo);
        m.setTexto(texto != null ? texto : "");
        m.setDireccion(MensajeCampania.Direccion.IN);
        m.setLeido(false);
        mensajeRepo.save(m);

        if (dispositivo.getAgencia() != null) {
            messaging.convertAndSend("/topic/campania/" + dispositivo.getAgencia().getId(),
                    Map.<String, Object>of("tipo", "MENSAJE_IN",
                           "contactoId", c.getId(),
                           "telefono", telefonoFrom,
                           "nombre", c.getNombre(),
                           "texto", texto != null ? texto : ""));
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // HELPERS
    // ════════════════════════════════════════════════════════════════════════

    private String leerCelda(Cell cell, boolean soloNumeros) {
        if (cell == null) return "";
        String value = switch (cell.getCellType()) {
            case STRING -> cell.getStringCellValue();
            case NUMERIC -> String.valueOf((long) cell.getNumericCellValue());
            case BOOLEAN -> String.valueOf(cell.getBooleanCellValue());
            case FORMULA -> switch (cell.getCachedFormulaResultType()) {
                case STRING -> cell.getStringCellValue();
                case NUMERIC -> String.valueOf((long) cell.getNumericCellValue());
                case BOOLEAN -> String.valueOf(cell.getBooleanCellValue());
                default -> "";
            };
            default -> "";
        };
        return soloNumeros ? value.replaceAll("\\D", "") : value.trim();
    }

    @SuppressWarnings({"unused", "null"})
    private Dispositivo requireDispositivo(Long dispositivoId, Long agenciaId) {
        return dispositivoRepo.findById(dispositivoId)
                .filter(d -> d.getAgencia() != null && d.getAgencia().getId().equals(agenciaId))
                .filter(d -> d.getProposito() == Dispositivo.Proposito.CAMPANIAS)
                .orElseThrow(() -> new IllegalArgumentException("Dispositivo de campaña no encontrado"));
    }
}
