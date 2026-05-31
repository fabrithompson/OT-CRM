package service;

import java.io.ByteArrayInputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xwpf.extractor.XWPFWordExtractor;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;

import model.Mensaje;

/**
 * Enriquece mensajes de auditoría con el contenido real de archivos adjuntos.
 * - AUDIO: transcribe vía Whisper API (OpenAI)
 * - PDF: extrae texto con PDFBox 3.x
 * - DOCX: extrae texto con Apache POI
 * - TXT: lee directamente
 */
@Service
public class MediaAuditEnricher {

    private static final Logger log = LoggerFactory.getLogger(MediaAuditEnricher.class);

    private static final int MAX_DOC_CHARS = 2000;
    private static final int MAX_AUDIO_BYTES = 24 * 1024 * 1024; // 24 MB (límite Whisper 25 MB)
    private static final String WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";

    private final RestTemplate restTemplate;

    @Value("${spring.ai.openai.api-key:}")
    private String openAiApiKey;

    public MediaAuditEnricher(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    /**
     * Retorna texto enriquecido para insertar en el contexto de auditoría,
     * o null si el tipo no es auditable o si falla la extracción.
     */
    @Nullable
    public String enriquecer(Mensaje m) {
        if (m.getUrlArchivo() == null || m.getUrlArchivo().isBlank()) return null;
        if (m.getTipo() == null) return null;

        return switch (m.getTipo()) {
            case AUDIO     -> enriquecerAudio(m);
            case DOCUMENTO -> enriquecerDocumento(m);
            default        -> null;
        };
    }

    // ─── Audio ────────────────────────────────────────────────────────────────

    @Nullable
    private String enriquecerAudio(Mensaje m) {
        try {
            byte[] bytes = descargar(m.getUrlArchivo());
            if (bytes == null || bytes.length == 0) return null;
            if (bytes.length > MAX_AUDIO_BYTES) return "[Audio: demasiado grande para transcribir]";

            String filename = extractFilename(m.getUrlArchivo(), "audio.ogg");
            String transcript = transcribirWhisper(bytes, filename);
            if (transcript == null || transcript.isBlank()) return null;
            return "[Transcripción de audio: \"" + transcript.trim() + "\"]";
        } catch (Exception e) {
            log.warn("No se pudo transcribir audio del mensaje {}: {}", m.getId(), e.getMessage());
            return "[Audio: no se pudo transcribir]";
        }
    }

    @Nullable
    private String transcribirWhisper(byte[] bytes, String filename) {
        if (openAiApiKey == null || openAiApiKey.isBlank()) {
            log.warn("OPENAI_API_KEY no configurada, omitiendo transcripción de audio");
            return null;
        }

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);
        headers.setBearerAuth(openAiApiKey);

        final String fname = filename;
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("model", "whisper-1");
        body.add("language", "es");
        body.add("file", new ByteArrayResource(bytes) {
            @Override public String getFilename() { return fname; }
        });

        HttpEntity<MultiValueMap<String, Object>> request = new HttpEntity<>(body, headers);
        @SuppressWarnings("unchecked")
        ResponseEntity<Map<String, Object>> response = restTemplate.postForEntity(
                WHISPER_URL, request, (Class<Map<String, Object>>) (Class<?>) Map.class);

        if (response.getStatusCode().is2xxSuccessful()) {
            Map<String, Object> respBody = response.getBody();
            if (respBody != null) {
                Object text = respBody.get("text");
                return text != null ? text.toString() : null;
            }
        }
        return null;
    }

    // ─── Documentos ───────────────────────────────────────────────────────────

    @Nullable
    private String enriquecerDocumento(Mensaje m) {
        try {
            byte[] bytes = descargar(m.getUrlArchivo());
            if (bytes == null || bytes.length == 0) return null;

            String filename = extractFilename(m.getUrlArchivo(), "doc");
            String ext = extension(filename);
            String texto = switch (ext) {
                case "pdf"  -> extraerPdf(bytes);
                case "docx" -> extraerDocx(bytes);
                case "txt"  -> new String(bytes, StandardCharsets.UTF_8);
                default     -> null;
            };
            if (texto == null || texto.isBlank()) return null;

            String truncado = texto.length() > MAX_DOC_CHARS
                    ? texto.substring(0, MAX_DOC_CHARS) + "... [truncado]"
                    : texto;
            return "[Contenido del documento (" + ext.toUpperCase() + "): " + truncado.trim() + "]";
        } catch (Exception e) {
            log.warn("No se pudo extraer texto del documento del mensaje {}: {}", m.getId(), e.getMessage());
            return "[Documento: no se pudo leer el contenido]";
        }
    }

    private String extraerPdf(byte[] bytes) throws Exception {
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            return new PDFTextStripper().getText(doc);
        }
    }

    private String extraerDocx(byte[] bytes) throws Exception {
        try (XWPFDocument doc = new XWPFDocument(new ByteArrayInputStream(bytes));
             XWPFWordExtractor extractor = new XWPFWordExtractor(doc)) {
            return extractor.getText();
        }
    }

    // ─── HTTP helper ──────────────────────────────────────────────────────────

    @Nullable
    private byte[] descargar(String url) {
        try {
            return restTemplate.getForObject(url, byte[].class);
        } catch (Exception e) {
            log.warn("No se pudo descargar archivo desde {}: {}", url, e.getMessage());
            return null;
        }
    }

    // ─── Utils ────────────────────────────────────────────────────────────────

    private static String extractFilename(String url, String fallback) {
        try {
            String path = URI.create(url).getPath();
            String name = path.substring(path.lastIndexOf('/') + 1);
            int q = name.indexOf('?');
            name = q >= 0 ? name.substring(0, q) : name;
            return name.isBlank() ? fallback : name;
        } catch (Exception e) {
            return fallback;
        }
    }

    private static String extension(String filename) {
        int dot = filename.lastIndexOf('.');
        return dot >= 0 ? filename.substring(dot + 1).toLowerCase() : "";
    }
}
