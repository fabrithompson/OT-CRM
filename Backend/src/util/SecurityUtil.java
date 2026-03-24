package util;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

public final class SecurityUtil {

    private SecurityUtil() {}

    /**
     * Comparación de strings en tiempo constante para evitar timing attacks.
     * Usar para validar tokens, claves de API y firmas de webhook.
     */
    public static boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null) return false;
        return MessageDigest.isEqual(
                a.getBytes(StandardCharsets.UTF_8),
                b.getBytes(StandardCharsets.UTF_8)
        );
    }
}
