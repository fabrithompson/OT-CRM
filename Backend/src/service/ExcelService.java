package service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import model.Cliente;
import model.Transaccion;

@Service
public class ExcelService {

    private static final Logger logger = LoggerFactory.getLogger(ExcelService.class);
    private static final String[] COL_TRANSACCIONES = {"Número", "Cliente", "Monto", "Fecha", "Hora", "Tipo", "Cajero", "Dispositivo", "Plataforma"};
    private static final ZoneId ZONA_ARGENTINA = ZoneId.of("America/Argentina/Buenos_Aires");
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("HH:mm");
    private static final DateTimeFormatter FORMATTER = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");

    public ByteArrayInputStream generarReporteExcel(List<Transaccion> transacciones) throws IOException {
        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {

            Sheet sheet = workbook.createSheet("Transacciones");
            CellStyle styleCarga = crearEstiloCelda(workbook, IndexedColors.GREEN);
            CellStyle styleRetiro = crearEstiloCelda(workbook, IndexedColors.RED);

            crearHeaderTransacciones(workbook, sheet);
            llenarFilasTransacciones(sheet, transacciones, styleCarga, styleRetiro);

            for (int i = 0; i < COL_TRANSACCIONES.length; i++) {
                sheet.autoSizeColumn(i);
            }

            workbook.write(out);
            return new ByteArrayInputStream(out.toByteArray());
        }
    }

    private void crearHeaderTransacciones(Workbook workbook, Sheet sheet) {
        CellStyle headerStyle = crearEstiloHeader(workbook);
        Row headerRow = sheet.createRow(0);

        for (int col = 0; col < COL_TRANSACCIONES.length; col++) {
            Cell cell = headerRow.createCell(col);
            cell.setCellValue(COL_TRANSACCIONES[col]);
            cell.setCellStyle(headerStyle);
        }
    }

    private void llenarFilasTransacciones(Sheet sheet, List<Transaccion> transacciones, CellStyle styleCarga, CellStyle styleRetiro) {
        int rowIdx = 1;
        for (Transaccion t : transacciones) {
            Row row = sheet.createRow(rowIdx++);
            llenarFilaTransaccion(row, t, styleCarga, styleRetiro);
        }
    }

    private void llenarFilaTransaccion(Row row, Transaccion t, CellStyle styleCarga, CellStyle styleRetiro) {
        row.createCell(0).setCellValue(obtenerTelefonoCliente(t));
        row.createCell(1).setCellValue(obtenerNombreCliente(t));
        row.createCell(2).setCellValue(t.getMonto());
        llenarCeldasFechaHora(row, t.getFecha());
        aplicarEstiloTipoTransaccion(row, t.getTipo(), styleCarga, styleRetiro);
        row.createCell(6).setCellValue(obtenerNombreCajero(t));
        llenarCeldasCliente(row, t.getCliente());
    }

    private static String obtenerTelefonoCliente(Transaccion t) {
        return t.getCliente() != null ? t.getCliente().getTelefono() : "N/A";
    }

    private static String obtenerNombreCliente(Transaccion t) {
        return t.getCliente() != null ? t.getCliente().getNombre() : "N/A";
    }

    private void llenarCeldasFechaHora(Row row, LocalDateTime fecha) {
        if (fecha == null) {
            return;
        }
        LocalDateTime fechaArg = fecha.atZone(ZoneId.systemDefault()).withZoneSameInstant(ZONA_ARGENTINA).toLocalDateTime();
        row.createCell(3).setCellValue(fechaArg.format(DATE_FORMATTER));
        row.createCell(4).setCellValue(fechaArg.format(TIME_FORMATTER));
    }

    private void aplicarEstiloTipoTransaccion(Row row, String tipo, CellStyle styleCarga, CellStyle styleRetiro) {
        Cell tipoCell = row.createCell(5);
        tipoCell.setCellValue(tipo != null ? tipo : "");
        if ("CARGA".equalsIgnoreCase(tipo)) {
            tipoCell.setCellStyle(styleCarga);
        } else if ("RETIRO".equalsIgnoreCase(tipo)) {
            tipoCell.setCellStyle(styleRetiro);
        }
    }

    private static String obtenerNombreCajero(Transaccion t) {
        return t.getUsuario() != null ? t.getUsuario().getUsername() : "Sistema";
    }

    private void llenarCeldasCliente(Row row, Cliente cliente) {
        if (cliente == null) {
            row.createCell(7).setCellValue("N/A");
            row.createCell(8).setCellValue("N/A");
            return;
        }
        String aliasDisp = cliente.getDispositivo() != null ? cliente.getDispositivo().getAlias() : "N/A";
        row.createCell(7).setCellValue(aliasDisp);
        row.createCell(8).setCellValue(cliente.getOrigen() != null ? cliente.getOrigen() : "N/A");
    }

    @SuppressWarnings("unused")
    private String formatearFechaTransaccion(LocalDateTime fecha) {
        if (fecha == null) {
            return "";
        }
        return fecha.atZone(ZoneId.systemDefault())
                .withZoneSameInstant(ZONA_ARGENTINA)
                .format(FORMATTER);
    }

    public ByteArrayInputStream exportarClientes(List<Cliente> clientes) throws IOException {
        String[] columnasClientes = {"Nombre", "Teléfono", "Fecha Registro"};

        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {

            Sheet sheet = workbook.createSheet("Contactos");
            crearHeaderClientes(workbook, sheet, columnasClientes);
            llenarFilasClientes(sheet, clientes);
            autoSizeColumns(sheet, columnasClientes.length);

            workbook.write(out);
            return new ByteArrayInputStream(out.toByteArray());
        }
    }

    private void crearHeaderClientes(Workbook workbook, Sheet sheet, String[] columnas) {
        CellStyle headerStyle = crearEstiloHeader(workbook);
        Row headerRow = sheet.createRow(0);

        for (int i = 0; i < columnas.length; i++) {
            Cell cell = headerRow.createCell(i);
            cell.setCellValue(columnas[i]);
            cell.setCellStyle(headerStyle);
        }
    }

    private void llenarFilasClientes(Sheet sheet, List<Cliente> clientes) {
        int rowIdx = 1;
        for (Cliente c : clientes) {
            if (c == null) continue;
            Row row = sheet.createRow(rowIdx++);
            row.createCell(0).setCellValue(c.getNombre() != null ? c.getNombre() : "");
            row.createCell(1).setCellValue(c.getTelefono() != null ? c.getTelefono() : "");
            row.createCell(2).setCellValue(formatearFechaRegistro(c.getFechaRegistro()));
        }
    }

    private CellStyle crearEstiloCelda(Workbook workbook, IndexedColors color) {
        CellStyle style = workbook.createCellStyle();
        Font font = workbook.createFont();
        font.setColor(color.getIndex());
        font.setBold(true);
        style.setFont(font);
        return style;
    }

    private String formatearFechaRegistro(LocalDateTime fecha) {
        return fecha != null ? fecha.toString() : "";
    }

    private void autoSizeColumns(Sheet sheet, int columnCount) {
        for (int i = 0; i < columnCount; i++) {
            sheet.autoSizeColumn(i);
        }
    }

    public List<Cliente> importarClientes(MultipartFile file) throws IOException {
        logger.info("Iniciando importación de Excel: {}", file.getOriginalFilename());
        logger.info("Tamaño del archivo: {} bytes", file.getSize());

        try (Workbook workbook = new XSSFWorkbook(file.getInputStream())) {
            Sheet sheet = workbook.getSheetAt(0);
            return procesarFilasExcel(sheet);
        } catch (Exception e) {
            logger.error("Error crítico al leer el archivo Excel", e);
            throw new IOException("Error al procesar el archivo Excel: " + e.getMessage(), e);
        }
    }

    private List<Cliente> procesarFilasExcel(Sheet sheet) {
        List<Cliente> clientes = new ArrayList<>();
        Iterator<Row> rows = sheet.iterator();

        if (rows.hasNext()) {
            rows.next();
            logger.info("Cabecera detectada en fila 0");
        }

        int filasProcesadas = 0;
        int filasValidas = 0;
        int filasInvalidas = 0;

        while (rows.hasNext()) {
            Row row = rows.next();
            filasProcesadas++;

            ResultadoValidacion resultado = procesarFila(row);

            if (resultado.esValido()) {
                clientes.add(resultado.getCliente());
                filasValidas++;
            } else {
                filasInvalidas++;
            }
        }

        logResumenImportacion(filasProcesadas, filasValidas, filasInvalidas);
        return clientes;
    }

    private ResultadoValidacion procesarFila(Row row) {
        try {
            String nombre = getCellValueAsString(row.getCell(0), false);
            String telefono = getCellValueAsString(row.getCell(1), true);

            logger.debug("Fila {}: Nombre='{}', Teléfono='{}'",
                    row.getRowNum(), nombre, telefono);

            if (telefono == null || telefono.trim().isEmpty()) {
                logger.warn("Fila {} omitida: teléfono vacío", row.getRowNum());
                return ResultadoValidacion.invalido();
            }

            if (telefono.length() < 10) {
                logger.warn("Fila {} omitida: teléfono muy corto ({})",
                        row.getRowNum(), telefono);
                return ResultadoValidacion.invalido();
            }
            if (nombre == null || nombre.trim().isEmpty()) {
                logger.warn("Fila {}: nombre vacío, usando 'Sin Nombre'", row.getRowNum());
                nombre = "Sin Nombre";
            }
            Cliente cliente = crearCliente(nombre.trim(), telefono.trim());
            return ResultadoValidacion.valido(cliente);

        } catch (Exception e) {
            logger.error("Error procesando fila {}: {}", row.getRowNum(), e.getMessage());
            return ResultadoValidacion.invalido();
        }
    }

    private Cliente crearCliente(String nombre, String telefono) {
        Cliente cliente = new Cliente();
        cliente.setNombre(nombre);
        cliente.setTelefono(telefono);
        cliente.setFechaRegistro(LocalDateTime.now());
        cliente.setOrigen("MANUAL");
        return cliente;
    }

    private void logResumenImportacion(int procesadas, int validas, int invalidas) {
        logger.info("Importación completada:");
        logger.info("   - Filas procesadas: {}", procesadas);
        logger.info("   - Clientes válidos: {}", validas);
        logger.info("   - Filas inválidas: {}", invalidas);
    }

    private String getCellValueAsString(Cell cell, boolean soloNumeros) {
        if (cell == null) {
            return "";
        }

        String value = switch (cell.getCellType()) {
            case STRING ->
                    cell.getStringCellValue();
            case NUMERIC ->
                    String.valueOf((long) cell.getNumericCellValue());
            case BOOLEAN ->
                    String.valueOf(cell.getBooleanCellValue());
            case FORMULA ->
                    cell.getCellFormula();
            default ->
                    "";
        };

        return soloNumeros ? value.replaceAll("\\D", "") : value.trim();
    }

    private CellStyle crearEstiloHeader(Workbook workbook) {
        CellStyle style = workbook.createCellStyle();
        Font font = workbook.createFont();
        font.setBold(true);
        style.setFont(font);
        return style;
    }

    private static class ResultadoValidacion {

        private final boolean valido;
        private final Cliente cliente;

        private ResultadoValidacion(boolean valido, Cliente cliente) {
            this.valido = valido;
            this.cliente = cliente;
        }

        public static ResultadoValidacion valido(Cliente cliente) {
            return new ResultadoValidacion(true, cliente);
        }

        public static ResultadoValidacion invalido() {
            return new ResultadoValidacion(false, null);
        }

        public boolean esValido() {
            return valido;
        }

        public Cliente getCliente() {
            return cliente;
        }
    }
}