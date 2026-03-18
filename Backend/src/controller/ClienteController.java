package controller;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.lang.NonNull;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import model.Agencia;
import model.Cliente;
import model.Etapa;
import model.Etiqueta;
import model.Usuario;
import repository.ClienteRepository;
import repository.EtapaRepository;
import repository.EtiquetaRepository;
import repository.MensajeRepository;
import model.Plan;
import service.ExcelService;
import service.SubscriptionValidationService;
import service.UsuarioService;

@RestController
@RequestMapping("/api/v1")
public class ClienteController {

    private static final Logger logger = LoggerFactory.getLogger(ClienteController.class);
    private static final String MENSAJE_USUARIO_SIN_AGENCIA = "Usuario sin agencia asignada.";
    private static final String CONTENT_TYPE_EXCEL = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    @Autowired
    private ClienteRepository clienteRepository;
    @Autowired
    private EtapaRepository etapaRepository;
    @Autowired
    private UsuarioService usuarioService;
    @Autowired
    private ExcelService excelService;
    @Autowired
    private SubscriptionValidationService subscriptionValidationService;
    @Autowired
    private MensajeRepository mensajeRepository;
    @Autowired
    private EtiquetaRepository etiquetaRepository;
    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    @GetMapping("/embudo/etapas")
    public ResponseEntity<List<Etapa>> obtenerEtapasEmbudo(Authentication auth) {
        Usuario usuario = usuarioService.buscarPorUsername(auth.getName());

        if (tieneAgenciaValida(usuario)) {
            List<Etapa> etapas = etapaRepository.findByAgenciaIdOrderByOrdenAsc(usuario.getAgencia().getId());
            return ResponseEntity.ok(etapas); // Devuelve un JSON con la lista de etapas
        }

        return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    @GetMapping("/contactos/paginados")
    public ResponseEntity<Page<Cliente>> obtenerContactosPaginados(
            Authentication auth,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) String search) {

        Usuario usuario = usuarioService.buscarPorUsername(auth.getName());

        if (!tieneAgenciaValida(usuario)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        Page<Cliente> clientesPage = buscarClientes(usuario, search, page, size);
        return ResponseEntity.ok(clientesPage);
    }

    private Page<Cliente> buscarClientes(Usuario usuario, String search, int page, int size) {
        Pageable pageable = PageRequest.of(page, size);

        if (search != null && !search.isEmpty()) {
            return clienteRepository.findByAgenciaIdAndNombreContainingIgnoreCase(
                    usuario.getAgencia().getId(), search, pageable);
        }

        return clienteRepository.findByAgenciaIdOrderByFechaRegistroDesc(
                usuario.getAgencia().getId(), pageable);
    }

    @PostMapping("/contactos/importar")
    public ResponseEntity<String> importarExcel(
            @RequestParam("file") MultipartFile file,
            Authentication auth) {

        try {
            logInicioImportacion(file, auth);

            ResponseEntity<String> validacion = validarArchivoImportacion(file);
            if (validacion != null) {
                return validacion;
            }

            return procesarImportacion(file, auth);

        } catch (Exception e) {
            logger.error("Error inesperado en importación", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Error inesperado: " + e.getMessage());
        }
    }

    private void logInicioImportacion(MultipartFile file, Authentication auth) {
        logger.info("Solicitud de importación recibida");
        logger.info("Archivo: {}", file.getOriginalFilename());
        logger.info("Tamaño: {} bytes", file.getSize());
        logger.info("Usuario: {}", auth.getName());
    }

    private ResponseEntity<String> validarArchivoImportacion(MultipartFile file) {
        if (file.isEmpty()) {
            logger.error("Archivo vacío recibido");
            return ResponseEntity.badRequest().body("El archivo está vacío");
        }

        String filename = file.getOriginalFilename();
        if (!esArchivoExcelValido(filename)) {
            logger.error("Formato de archivo inválido: {}", filename);
            return ResponseEntity.badRequest()
                    .body("Formato inválido. Solo se permiten archivos .xlsx o .xls");
        }

        return null;
    }

    private boolean esArchivoExcelValido(String filename) {
        return filename != null && (filename.endsWith(".xlsx") || filename.endsWith(".xls"));
    }

    private ResponseEntity<String> procesarImportacion(MultipartFile file, Authentication auth) {
        try {
            Usuario usuario = usuarioService.buscarPorUsername(auth.getName());

            if (!tieneAgenciaValida(usuario)) {
                logger.error("Usuario sin agencia asignada: {}", auth.getName());
                return ResponseEntity.status(HttpStatus.FORBIDDEN).body(MENSAJE_USUARIO_SIN_AGENCIA);
            }

            logger.info("🏢 Agencia: {} (ID: {})",
                    usuario.getAgencia().getNombre(),
                    usuario.getAgencia().getId());

            List<Cliente> nuevosClientes = excelService.importarClientes(file);
            logger.info("Clientes leídos del Excel: {}", nuevosClientes.size());

            if (nuevosClientes.isEmpty()) {
                logger.warn("No se encontraron clientes válidos en el archivo");
                return ResponseEntity.ok("No se encontraron clientes válidos en el archivo");
            }

            ResponseEntity<String> validacionPlan = validarLimiteContactosImportacion(nuevosClientes, usuario);
            if (validacionPlan != null) {
                return validacionPlan;
            }

            ResultadoImportacion resultado = guardarClientesImportados(nuevosClientes, usuario);
            String mensaje = formatearMensajeResultado(resultado);
            logger.info(mensaje);

            return ResponseEntity.ok(mensaje);

        } catch (IOException e) {
            logger.error("Error al procesar archivo Excel", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Error al procesar el archivo: " + e.getMessage());
        }
    }

    private ResultadoImportacion guardarClientesImportados(List<Cliente> nuevosClientes, Usuario usuario) {
        int creados = 0;
        int omitidos = 0;
        int errores = 0;

        for (Cliente c : nuevosClientes) {
            ResultadoGuardado resultado = guardarCliente(c, usuario);

            switch (resultado) {
                case CREADO -> {
                    creados++;
                    logger.debug("Cliente creado: {} - Tel: {}", c.getNombre(), c.getTelefono());
                }
                case OMITIDO -> {
                    omitidos++;
                    logger.debug("Cliente ya existe: {} - Tel: {}", c.getNombre(), c.getTelefono());
                }
                case ERROR -> {
                    errores++;
                    logger.error("Error al guardar cliente {}", c.getTelefono());
                }
            }
        }

        return new ResultadoImportacion(creados, omitidos, errores);
    }

    private ResultadoGuardado guardarCliente(Cliente cliente, Usuario usuario) {
        try {
            cliente.setAgencia(usuario.getAgencia());
            cliente.setTelefono(normalizarTelefono(cliente.getTelefono()));

            Optional<Cliente> existente = clienteRepository.findByAgenciaIdAndTelefono(
                    usuario.getAgencia().getId(),
                    cliente.getTelefono()
            );

            if (existente.isEmpty()) {
                clienteRepository.save(cliente);
                return ResultadoGuardado.CREADO;
            }

            return ResultadoGuardado.OMITIDO;

        } catch (Exception e) {
            logger.error("Error al guardar cliente: {}", e.getMessage(), e);
            return ResultadoGuardado.ERROR;
        }
    }

    private String formatearMensajeResultado(ResultadoImportacion resultado) {
        return String.format(
                "Importación finalizada: %d creados, %d omitidos, %d errores",
                resultado.creados(), resultado.omitidos(), resultado.errores()
        );
    }

    private ResponseEntity<String> validarLimiteContactosImportacion(List<Cliente> nuevosClientes, Usuario usuario) {
        Agencia agencia = usuario.getAgencia();
        Plan plan = subscriptionValidationService.getPlanEfectivoAgencia(agencia);

        if (plan.getMaxContactos() == -1) {
            return null;
        }

        long contactosActuales = clienteRepository.countByAgenciaId(agencia.getId());

        long contactosNuevos = nuevosClientes.stream()
                .filter(c -> {
                    String telNormalizado = normalizarTelefono(c.getTelefono());
                    return clienteRepository.findByAgenciaIdAndTelefono(agencia.getId(), telNormalizado).isEmpty();
                })
                .count();

        long totalDespuesDeImportar = contactosActuales + contactosNuevos;

        if (totalDespuesDeImportar > plan.getMaxContactos()) {
            int disponibles = Math.max(0, plan.getMaxContactos() - (int) contactosActuales);
            String mensaje = String.format(
                    "No se puede completar la importación. Tu plan %s permite hasta %d contactos únicos. " +
                    "Actualmente tienes %d contactos y estás intentando agregar %d nuevos. " +
                    "Espacio disponible: %d contactos. Mejorá tu plan para importar más contactos.",
                    plan.getNombre(), plan.getMaxContactos(), contactosActuales, contactosNuevos, disponibles
            );
            logger.warn("Importación rechazada por límite de plan: {}", mensaje);
            return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED).body(mensaje);
        }

        return null;
    }

    @GetMapping("/contactos/exportar")
    public ResponseEntity<Resource> exportarExcel(Authentication auth) {
        try {
            Usuario usuario = usuarioService.buscarPorUsername(auth.getName());

            if (!tieneAgenciaValida(usuario)) {
                logger.error("Usuario sin agencia intentó exportar contactos");
                return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
            }

            List<Cliente> clientes = clienteRepository.findByAgenciaIdOrderByFechaRegistroDesc(
                    usuario.getAgencia().getId());

            logger.info("📤 Exportando {} contactos para usuario {}",
                    clientes.size(), auth.getName());

            ByteArrayInputStream in = excelService.exportarClientes(clientes);
            Objects.requireNonNull(in, "El stream de Excel no puede ser null");

            return crearRespuestaExcel(in);

        } catch (IOException e) {
            logger.error("Error al exportar contactos", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    private ResponseEntity<Resource> crearRespuestaExcel(@NonNull ByteArrayInputStream in) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=contactos.xlsx")
                .contentType(MediaType.parseMediaType(CONTENT_TYPE_EXCEL))
                .body(new InputStreamResource(in));
    }

    @DeleteMapping("/clientes/{id}")
    public ResponseEntity<?> eliminarCliente(@PathVariable @NonNull Long id, Authentication auth) {
        try {
            Usuario usuario = usuarioService.buscarPorUsername(auth.getName());
            Optional<Cliente> clienteOpt = clienteRepository.findById(id);

            if (clienteOpt.isEmpty()) {
                logger.warn("Cliente no encontrado: ID {}", id);
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body("{\"error\": \"Cliente no encontrado\"}");
            }

            return procesarEliminacion(clienteOpt.get(), usuario, auth, id);

        } catch (Exception e) {
            logger.error("Error al eliminar cliente", e);
            return crearRespuestaErrorEliminacion(e);
        }
    }

    private ResponseEntity<?> procesarEliminacion(Cliente cliente, Usuario usuario, Authentication auth, @NonNull Long id) {
        if (!perteneceAMismaAgencia(cliente, usuario)) {
            logger.warn("Usuario {} intentó eliminar cliente de otra agencia", auth.getName());
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body("{\"error\": \"No tienes permiso para eliminar este contacto\"}");
        }

        try {
            mensajeRepository.deleteByClienteId(id);
            logger.debug("Mensajes eliminados para cliente ID: {}", id);

            logger.info("Eliminando cliente: {} (ID: {})", cliente.getNombre(), id);
            clienteRepository.delete(cliente);

            Map<String, Object> evento = new HashMap<>();
            evento.put("tipo", "CLIENTE_ELIMINADO");
            evento.put("clienteId", id);

            messagingTemplate.convertAndSend(
                    "/topic/agencia/" + usuario.getAgencia().getId(),
                    evento
            );

            return ResponseEntity.ok().body("{\"message\": \"Contacto eliminado correctamente\"}");

        } catch (MessagingException e) {
            logger.error("Error al eliminar cliente y sus mensajes", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("{\"error\": \"Error al eliminar el contacto. Intenta nuevamente.\"}");
        }
    }

    private boolean perteneceAMismaAgencia(Cliente cliente, Usuario usuario) {
        return cliente.getAgencia() != null
                && usuario.getAgencia() != null
                && cliente.getAgencia().getId().equals(usuario.getAgencia().getId());
    }

    private ResponseEntity<?> crearRespuestaErrorEliminacion(Exception e) {
        String mensajeError = "Error al eliminar el contacto";

        if (e.getMessage() != null && e.getMessage().contains("foreign key constraint")) {
            mensajeError = "No se puede eliminar el contacto porque tiene datos asociados";
        }

        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body("{\"error\": \"" + mensajeError + "\"}");
    }

    private boolean tieneAgenciaValida(Usuario usuario) {
        return usuario != null && usuario.getAgencia() != null;
    }

    private String normalizarTelefono(String tel) {
        if (tel == null || tel.isBlank()) return "";
        String clean = tel.replaceAll("\\D", "");
        if (clean.length() > 10 && !clean.startsWith("0")) {
            if (clean.startsWith("54") && clean.length() == 12 && !clean.startsWith("549")) {
                return "549" + clean.substring(2);
            }
            return clean;
        }
        if (clean.length() == 10) return "549" + clean;
        if (clean.startsWith("0")) {
            String sinCero = clean.substring(1);
            return sinCero.length() == 10 ? "549" + sinCero : clean;
        }
        return clean;
    }

    private enum ResultadoGuardado {
        CREADO, OMITIDO, ERROR
    }

    private record ResultadoImportacion(int creados, int omitidos, int errores) {

    }

    @GetMapping("/clientes")
    public List<Cliente> obtenerClientesApi(
            @RequestParam(required = false) Long etiquetaId,
            @RequestParam(required = false) Long etapaId,
            @RequestParam(required = false) Long afterId,
            @RequestParam(defaultValue = "40") int size,
            Authentication auth) {

        Usuario usuario = usuarioService.buscarPorUsername(auth.getName());
        if (!tieneAgenciaValida(usuario)) {
            return Collections.emptyList();
        }
        Long agenciaId = usuario.getAgencia().getId();

        int pageSize = Math.max(1, Math.min(size, 100));
        Pageable pageable = PageRequest.of(0, pageSize,
                Sort.by(Sort.Direction.DESC, "id"));

        if (afterId != null) {
            if (etapaId != null && etiquetaId != null) {
                return clienteRepository.findByAgenciaIdAndEtapaIdAndEtiquetaIdAndIdLessThan(
                        agenciaId, etapaId, etiquetaId, afterId, pageable);
            } else if (etapaId != null) {
                return clienteRepository.findByAgenciaIdAndEtapaIdAndIdLessThan(
                        agenciaId, etapaId, afterId, pageable);
            } else if (etiquetaId != null) {
                return clienteRepository.findByAgenciaIdAndEtiquetaIdAndIdLessThan(
                        agenciaId, etiquetaId, afterId, pageable);
            } else {
                return clienteRepository.findByAgenciaIdAndIdLessThan(
                        agenciaId, afterId, pageable);
            }
        }

        if (etapaId != null && etiquetaId != null) {
            return clienteRepository.findByAgenciaIdAndEtapaIdAndEtiquetaId(
                    agenciaId, etapaId, etiquetaId, pageable);
        } else if (etapaId != null) {
            return clienteRepository.findByAgenciaIdAndEtapaId(
                    agenciaId, etapaId, pageable);
        } else if (etiquetaId != null) {
            return clienteRepository.findByAgenciaIdAndEtiquetaIdPaginated(
                    agenciaId, etiquetaId, pageable);
        }

        return clienteRepository.findByAgenciaIdPaginatedByLastMessage(agenciaId, pageable);
    }

    @GetMapping("/clientes/{id}")
    public ResponseEntity<Cliente> obtenerCliente(@PathVariable @NonNull Long id, Authentication auth) {
        Usuario usuario = usuarioService.buscarPorUsername(auth.getName());
        if (!tieneAgenciaValida(usuario)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        return clienteRepository.findById(id)
                .filter(c -> c.getAgencia() != null && c.getAgencia().getId().equals(usuario.getAgencia().getId()))
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/clientes/{id}/leido")
    public ResponseEntity<?> marcarComoLeido(@PathVariable @NonNull Long id, Authentication auth) {
        Usuario usuario = usuarioService.buscarPorUsername(auth.getName());
        if (!tieneAgenciaValida(usuario)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        clienteRepository.findById(id).ifPresent(c -> {
            if (c.getAgencia() != null && c.getAgencia().getId().equals(usuario.getAgencia().getId())) {
                c.setMensajesSinLeer(0);
                clienteRepository.save(c);

                messagingTemplate.convertAndSend("/topic/embudo/" + usuario.getAgencia().getId(), c);

                logger.info("📖 Cliente ID {} marcado como leído por {}", id, usuario.getUsername());
            }
        });
        return ResponseEntity.ok().build();
    }

    @PostMapping("/clientes/{id}/saldo")
    public ResponseEntity<?> actualizarSaldo(
            @PathVariable @NonNull Long id, 
            @RequestParam Double monto, 
            @RequestParam String accion, 
            Authentication auth) {
        
        if (monto == null || accion == null) {
            return ResponseEntity.badRequest().body("{\"error\": \"Monto y acción son requeridos\"}");
        }
        
        double montoValidado = monto;
        
        Usuario usuario = usuarioService.buscarPorUsername(auth.getName());
        if (!tieneAgenciaValida(usuario)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        
        Optional<Cliente> clienteOpt = clienteRepository.findById(id);
        if (clienteOpt.isPresent() && clienteOpt.get().getAgencia() != null 
            && clienteOpt.get().getAgencia().getId().equals(usuario.getAgencia().getId())) {
            
            Cliente c = clienteOpt.get();
            
            double saldoActual = Optional.ofNullable(c.getSaldo()).orElse(0.0);
            double nuevoSaldo = "sumar".equals(accion) ? saldoActual + montoValidado : saldoActual - montoValidado;
            
            c.setSaldo(nuevoSaldo);
            clienteRepository.save(c);
            
            Map<String, Object> evento = new HashMap<>();
            evento.put("tipo", "SALDO_ACTUALIZADO");
            evento.put("clienteId", id);
            evento.put("nuevoSaldo", nuevoSaldo);
            
            messagingTemplate.convertAndSend(
                "/topic/agencia/" + usuario.getAgencia().getId(), 
                evento
            );
            
            return ResponseEntity.ok().body("{\"nuevoSaldo\": " + c.getSaldo() + "}");
        }
        return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    @PostMapping("/clientes/{id}/etiquetas")
    public ResponseEntity<?> agregarEtiqueta(
            @PathVariable @NonNull Long id, 
            @RequestBody Etiqueta tagData, 
            Authentication auth) {
        
        Usuario usuario = usuarioService.buscarPorUsername(auth.getName());
        if (!tieneAgenciaValida(usuario)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        if (tagData == null || tagData.getNombre() == null || tagData.getNombre().isBlank()) {
            return ResponseEntity.badRequest().body("Nombre de etiqueta inválido");
        }
        Optional<Cliente> clienteOpt = clienteRepository.findById(id);

        if (clienteOpt.isPresent() && clienteOpt.get().getAgencia() != null && clienteOpt.get().getAgencia().getId().equals(usuario.getAgencia().getId())) {
            Cliente cliente = clienteOpt.get();
            Agencia agencia = usuario.getAgencia();

            Etiqueta etiqueta = etiquetaRepository.findByNombreAndAgenciaId(tagData.getNombre(), agencia.getId())
                    .orElseGet(() -> {
                        Etiqueta nueva = new Etiqueta();
                        nueva.setNombre(tagData.getNombre());
                        nueva.setColor(tagData.getColor());
                        nueva.setAgencia(agencia);
                        return etiquetaRepository.save(nueva);
                    });

            cliente.getEtiquetas().add(etiqueta);
            clienteRepository.save(cliente);

            Map<String, Object> evento = new HashMap<>();
            evento.put("tipo", "ETIQUETAS_ACTUALIZADAS");
            evento.put("clienteId", id);
            evento.put("etiquetas", cliente.getEtiquetas());

            messagingTemplate.convertAndSend(
                    "/topic/agencia/" + agencia.getId(),
                    evento
            );

            logger.info("Etiqueta '{}' agregada al cliente ID {} por {}",
                    etiqueta.getNombre(), id, usuario.getUsername());


            return ResponseEntity.ok(cliente.getEtiquetas());
        }
        return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    @PutMapping("/clientes/{id}")
    public ResponseEntity<?> actualizarInfo(
            @PathVariable @NonNull Long id, 
            @RequestBody Cliente data, 
            Authentication auth) {
        
        Usuario usuario = usuarioService.buscarPorUsername(auth.getName());
        if (!tieneAgenciaValida(usuario)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        return clienteRepository.findById(id)
                .filter(c -> c.getAgencia() != null && c.getAgencia().getId().equals(usuario.getAgencia().getId()))
                .map(c -> {
                    c.setNombre(data.getNombre());
                    c.setNotas(data.getNotas());
                    clienteRepository.save(c);

                    Map<String, Object> evento = new HashMap<>();
                    evento.put("tipo", "CLIENTE_ACTUALIZADO");
                    evento.put("clienteId", id);
                    evento.put("nombre", c.getNombre());
                    evento.put("notas", c.getNotas());

                    messagingTemplate.convertAndSend(
                            "/topic/agencia/" + usuario.getAgencia().getId(),
                            evento
                    );

                    logger.info("Cliente ID {} actualizado por {}", id, usuario.getUsername());

                    return ResponseEntity.ok().build();
                }).orElse(ResponseEntity.status(HttpStatus.FORBIDDEN).build());
    }

    @DeleteMapping("/clientes/{clienteId}/etiquetas/{tagId}")
    public ResponseEntity<?> quitarEtiqueta(
            @PathVariable @NonNull Long clienteId, 
            @PathVariable @NonNull Long tagId, 
            Authentication auth) {
        
        Usuario usuario = usuarioService.buscarPorUsername(auth.getName());
        if (!tieneAgenciaValida(usuario)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        Optional<Cliente> clienteOpt = clienteRepository.findById(clienteId);

        if (clienteOpt.isPresent() && clienteOpt.get().getAgencia() != null && clienteOpt.get().getAgencia().getId().equals(usuario.getAgencia().getId())) {
            Cliente cliente = clienteOpt.get();

            cliente.getEtiquetas().removeIf(t -> t.getId().equals(tagId));
            clienteRepository.save(cliente);

            logger.info("Etiqueta ID {} quitada del cliente ID {}", tagId, clienteId);


            Map<String, Object> evento = new HashMap<>();
            evento.put("tipo", "ETIQUETAS_ACTUALIZADAS");
            evento.put("clienteId", clienteId);
            evento.put("etiquetas", cliente.getEtiquetas());

            messagingTemplate.convertAndSend(
                    "/topic/agencia/" + usuario.getAgencia().getId(),
                    evento
            );

            return ResponseEntity.ok(cliente.getEtiquetas());
        }

        return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    @PatchMapping("/clientes/{id}/etapa")
    public ResponseEntity<?> actualizarEtapa(
            @PathVariable @NonNull Long id, 
            @RequestParam Long nuevaEtapaId, 
            Authentication auth) {
        
        if (nuevaEtapaId == null) {
            return ResponseEntity.badRequest().body("{\"error\": \"El ID de la etapa es requerido\"}");
        }
        
        Usuario usuario = usuarioService.buscarPorUsername(auth.getName());
        if (!tieneAgenciaValida(usuario)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        
        Optional<Cliente> clienteOpt = clienteRepository.findById(id);
        Optional<Etapa> etapaOpt = etapaRepository.findById(nuevaEtapaId);

        if (clienteOpt.isPresent() && etapaOpt.isPresent()) {
            Cliente cliente = clienteOpt.get();
            if (cliente.getAgencia() != null && cliente.getAgencia().getId().equals(usuario.getAgencia().getId())) {
                cliente.setEtapa(etapaOpt.get());
                clienteRepository.save(cliente);

                Map<String, Object> payload = new HashMap<>();
                payload.put("tipo", "CLIENTE_MOVIDO");
                payload.put("clienteId", id);
                payload.put("nuevaEtapaId", nuevaEtapaId);

                messagingTemplate.convertAndSend("/topic/agencia/" + usuario.getAgencia().getId(), payload);

                return ResponseEntity.ok().build();
            }
        }
        return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    @GetMapping("/busqueda/global")
    public ResponseEntity<List<Map<String, Object>>> buscarGlobal(
            @RequestParam String q, 
            Authentication auth) {
        
        Usuario usuario = usuarioService.buscarPorUsername(auth.getName());
        if (!tieneAgenciaValida(usuario)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        if (q == null || q.trim().length() < 2) {
            return ResponseEntity.ok(Collections.emptyList());
        }

        List<Cliente> resultados = clienteRepository.buscarGlobal(
                usuario.getAgencia().getId(), 
                q.trim(), 
                PageRequest.of(0, 20)
        );

        List<Map<String, Object>> response = resultados.stream().map(c -> {
            Map<String, Object> map = new HashMap<>();
            map.put("id", c.getId());
            map.put("nombre", c.getNombre());
            map.put("telefono", c.getTelefono());
            map.put("fotoUrl", c.getFotoUrl());
            map.put("origen", c.getOrigen());
            map.put("etapa", c.getEtapa() != null ? c.getEtapa().getNombre() : "-");
            map.put("dispositivo", c.getDispositivo() != null ? c.getDispositivo().getAlias() : null);
            map.put("ultimoMensaje", c.getUltimoMensajeResumen());
            
            List<Map<String, String>> tags = c.getEtiquetas().stream().map(t -> {
                Map<String, String> tMap = new HashMap<>();
                tMap.put("nombre", t.getNombre());
                tMap.put("color", t.getColor());
                return tMap;
            }).toList();

            map.put("etiquetas", tags);

            return map;
        }).toList();

        return ResponseEntity.ok(response);
    }

}