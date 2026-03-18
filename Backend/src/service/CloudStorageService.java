package service;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;

import exception.FileStorageException;

@Service
public class CloudStorageService {

    private static final Logger log = LoggerFactory.getLogger(CloudStorageService.class);
    private final Cloudinary cloudinary;

    public CloudStorageService(
            @Value("${CLOUDINARY_CLOUD_NAME}") String cloudName,
            @Value("${CLOUDINARY_API_KEY}") String apiKey,
            @Value("${CLOUDINARY_API_SECRET}") String apiSecret) {

        if (cloudName == null || apiKey == null || apiSecret == null) {
            throw new IllegalStateException("Faltan configuraciones críticas de Cloudinary.");
        }

        this.cloudinary = new Cloudinary(ObjectUtils.asMap(
                "cloud_name", cloudName,
                "api_key", apiKey,
                "api_secret", apiSecret,
                "secure", true
        ));
    }

    public String uploadFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new FileStorageException("No se puede subir un archivo vacío o nulo.");
        }

        try {
            byte[] bytes = file.getBytes();
            String fileName = UUID.randomUUID().toString() + "_" + sanitizeFilename(file.getOriginalFilename());
            return executeUpload(bytes, fileName);
        } catch (IOException e) {
            throw new FileStorageException("Error al procesar los bytes del archivo", e);
        }
    }

    public String uploadBytes(byte[] bytes, String fileName) {
        if (bytes == null || bytes.length == 0) {
            throw new FileStorageException("Los bytes del archivo están vacíos.");
        }
        return executeUpload(bytes, sanitizeFilename(fileName));
    }

    public String uploadFromUrl(String remoteUrl, String identifier) {
        if (remoteUrl == null || remoteUrl.isBlank()) {
            return null;
        }

        try {
            String cleanId = identifier.replaceAll("[^a-zA-Z0-9_-]", "_");

            Map<String, Object> params = Map.of(
                    "public_id", "crm_avatars/perfil_" + cleanId,
                    "resource_type", "image",
                    "overwrite", true
            );

            @SuppressWarnings("unchecked")
            Map<String, Object> uploadResult = cloudinary.uploader().upload(remoteUrl, params);

            Object secureUrl = uploadResult.get("secure_url");
            if (secureUrl != null) {
                log.info("Avatar persistido en Cloudinary: {}", secureUrl);
                return secureUrl.toString();
            }
            return null;

        } catch (IOException e) {
            log.error("Fallo subiendo avatar de URL a Cloudinary: " + remoteUrl, e);
            return remoteUrl;
        }
    }

    private String executeUpload(byte[] bytes, String fileName) {
        try {
            // Preservar extensión en el public_id para que la URL tenga el tipo correcto
            String ext = fileName.contains(".") ? fileName.substring(fileName.lastIndexOf(".")) : "";
            String baseName = fileName.contains(".") ? fileName.substring(0, fileName.lastIndexOf(".")) : fileName;
            String cleanBase = baseName.replaceAll("[^a-zA-Z0-9_-]", "_");
            String cleanId = cleanBase + ext.toLowerCase(); // ej: uuid_reporte.pdf

            // Imágenes y videos usan resource_type "auto",
            // pero PDFs/docs necesitan "raw" para ser accesibles públicamente sin 401
            String extLower = ext.toLowerCase();
            boolean isImage = extLower.matches("\\.(jpg|jpeg|png|gif|webp|bmp|svg)");
            boolean isVideo = extLower.matches("\\.(mp4|mov|avi|mkv|webm)");
            String resourceType = (isImage || isVideo) ? "auto" : "raw";

            Map<String, Object> params = Map.of(
                    "public_id", "crm_chat_files/" + cleanId,
                    "resource_type", resourceType
            );

            @SuppressWarnings("unchecked")
            Map<String, Object> uploadResult = cloudinary.uploader().upload(bytes, params);
            Object secureUrl = uploadResult.get("secure_url");

            if (secureUrl == null) {
                throw new FileStorageException("Cloudinary no devolvió una URL segura.");
            }

            log.info("Archivo persistido en Cloudinary: {}", cleanId);
            return secureUrl.toString();

        } catch (IOException e) {
            log.error("Fallo subiendo a Cloudinary", e);
            throw new FileStorageException("Error de comunicación con Cloudinary", e);
        }
    }

    /**
     * Upload asíncrono de archivo — no bloquea el thread del request.
     * El caller recibe un CompletableFuture con la URL de Cloudinary.
     * Ideal para archivos de chat: el mensaje se envía a WhatsApp inmediatamente
     * y la URL persistida se actualiza cuando Cloudinary responde.
     */
    @Async
    public CompletableFuture<String> uploadFileAsync(byte[] bytes, String fileName) {
        try {
            String result = executeUpload(bytes, sanitizeFilename(fileName));
            return CompletableFuture.completedFuture(result);
        } catch (Exception e) {
            log.error("Error en upload async a Cloudinary: {}", e.getMessage());
            return CompletableFuture.failedFuture(e);
        }
    }

    /**
     * Upload asíncrono de avatar desde URL remota.
     */
    @Async
    public CompletableFuture<String> uploadFromUrlAsync(String remoteUrl, String identifier) {
        String result = uploadFromUrl(remoteUrl, identifier);
        return CompletableFuture.completedFuture(result);
    }

    private String sanitizeFilename(String originalFilename) {
        if (originalFilename == null) {
            return "archivo_" + System.currentTimeMillis();
        }
        return originalFilename.replaceAll("[^a-zA-Z0-9.-]", "_");
    }
}