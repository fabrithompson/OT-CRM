package controller;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;

import model.Transaccion;
import repository.TransaccionRepository;
import service.ExcelService;

@RestController
@RequestMapping("/api/v1/reportes")
public class ReporteController {

    private static final Logger log = LoggerFactory.getLogger(ReporteController.class);

    private final TransaccionRepository transaccionRepository;
    private final ExcelService excelService;

    public ReporteController(TransaccionRepository transaccionRepository, ExcelService excelService) {
        this.transaccionRepository = transaccionRepository;
        this.excelService = excelService;
    }

    @GetMapping("/descargar/excel")
    @Transactional(readOnly = true)
    public ResponseEntity<InputStreamResource> descargarExcel() {
        try {
            List<Transaccion> transacciones = transaccionRepository.findAllByOrderByFechaDesc();

            if (transacciones == null) {
                log.error("La base de datos devolvió NULL para la lista de transacciones.");
                throw new IOException("La lista de transacciones es NULL.");
            }

            log.info("📊 Transacciones encontradas: {}", transacciones.size());
            if (!transacciones.isEmpty()) {
                Transaccion t0 = transacciones.get(0);
                log.info("Primera transacción: id={} monto={} cliente={}",
                        t0.getId(), t0.getMonto(),
                        t0.getCliente() != null ? t0.getCliente().getNombre() : "NULL");
            }
            ByteArrayInputStream in = excelService.generarReporteExcel(transacciones);

            if (in == null) {
                log.error("El servicio de Excel devolvió NULL.");
                throw new IOException("El servicio de Excel devolvió un archivo vacío.");
            }

            String nombreArchivo = generarNombreArchivo();
            HttpHeaders headers = new HttpHeaders();
            headers.add(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=" + nombreArchivo);

            byte[] bytes = in.readAllBytes();
            headers.setContentLength(bytes.length);

            return ResponseEntity
                    .ok()
                    .headers(headers)
                    .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                    .body(new InputStreamResource(new java.io.ByteArrayInputStream(bytes)));

        } catch (IOException | RuntimeException e) {
            log.error("Error crítico generando el reporte Excel", e);
            throw new RuntimeException("Error generando Excel: " + e.getMessage(), e);
        }
    }

    private String generarNombreArchivo() {
        LocalDateTime ahora = LocalDateTime.now(ZoneId.of("America/Argentina/Buenos_Aires"));
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("dd-MM-yyyy_HH-mm'hs'");
        return "Reporte_" + ahora.format(formatter) + ".xlsx";
    }
}