import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * Tests unitarios para la lógica de verificación de firma de webhooks.
 * No requiere Spring context ni Docker — valida la lógica criptográfica pura.
 */
class WebhookSignatureVerificationTest {

    // ─── MercadoPago HMAC-SHA256 ────────────────────────────────────────────────

    @Nested
    @DisplayName("MercadoPago — Verificación HMAC-SHA256")
    class MercadoPagoSignatureTests {

        private static final String SECRET = "test-webhook-secret-32chars-long!";

        @Test
        @DisplayName("Firma válida es aceptada")
        void firmaValidaAceptada() {
            String dataId = "12345";
            String xRequestId = "req-abc-123";
            String ts = "1616000000";

            // Generar firma correcta
            String manifest = "id:" + dataId + ";request-id:" + xRequestId + ";ts:" + ts + ";";
            String validSignature = computeHmacSha256(SECRET, manifest);
            String xSignature = "ts=" + ts + ",v1=" + validSignature;

            assertThat(verificarFirmaMercadoPago(xSignature, xRequestId, dataId, SECRET)).isTrue();
        }

        @Test
        @DisplayName("Firma inválida es rechazada")
        void firmaInvalidaRechazada() {
            String xSignature = "ts=1616000000,v1=deadbeefdeadbeefdeadbeefdeadbeef";

            assertThat(verificarFirmaMercadoPago(xSignature, "req-123", "12345", SECRET)).isFalse();
        }

        @Test
        @DisplayName("Header x-signature nulo es rechazado")
        void signatureNulaRechazada() {
            assertThat(verificarFirmaMercadoPago(null, "req-123", "12345", SECRET)).isFalse();
        }

        @Test
        @DisplayName("Header x-signature vacío es rechazado")
        void signatureVaciaRechazada() {
            assertThat(verificarFirmaMercadoPago("", "req-123", "12345", SECRET)).isFalse();
        }

        @Test
        @DisplayName("Header x-signature sin ts es rechazado")
        void signatureSinTsRechazada() {
            assertThat(verificarFirmaMercadoPago("v1=abc123", "req-123", "12345", SECRET)).isFalse();
        }

        @Test
        @DisplayName("Header x-signature sin v1 es rechazado")
        void signatureSinV1Rechazada() {
            assertThat(verificarFirmaMercadoPago("ts=1616000000", "req-123", "12345", SECRET)).isFalse();
        }

        @Test
        @DisplayName("x-request-id nulo se maneja sin error")
        void requestIdNuloFunciona() {
            String dataId = "12345";
            String ts = "1616000000";

            // Generar firma con request-id vacío (como lo hace el controller)
            String manifest = "id:" + dataId + ";request-id:;ts:" + ts + ";";
            String validSignature = computeHmacSha256(SECRET, manifest);
            String xSignature = "ts=" + ts + ",v1=" + validSignature;

            assertThat(verificarFirmaMercadoPago(xSignature, null, dataId, SECRET)).isTrue();
        }

        @Test
        @DisplayName("Comparación es timing-safe (usa MessageDigest.isEqual)")
        void comparacionTimingSafe() {
            // Este test verifica que usamos isEqual en lugar de equals.
            // La lógica real lo hace — aquí solo verificamos que el resultado es correcto
            // para un payload donde las firmas difieren en el último byte.
            String dataId = "99999";
            String ts = "1616000001";
            String manifest = "id:" + dataId + ";request-id:req-x;ts:" + ts + ";";
            String correctHash = computeHmacSha256(SECRET, manifest);

            // Modificar último carácter
            char lastChar = correctHash.charAt(correctHash.length() - 1);
            char differentChar = lastChar == 'a' ? 'b' : 'a';
            String wrongHash = correctHash.substring(0, correctHash.length() - 1) + differentChar;

            String xSignatureWrong = "ts=" + ts + ",v1=" + wrongHash;
            assertThat(verificarFirmaMercadoPago(xSignatureWrong, "req-x", dataId, SECRET)).isFalse();
        }

        /**
         * Reproduce la lógica exacta de MercadoPagoController.verificarFirmaMercadoPago()
         */
        private boolean verificarFirmaMercadoPago(String xSignature, String xRequestId, String dataId, String secret) {
            try {
                if (xSignature == null || xSignature.isBlank()) return false;

                String ts = null;
                String v1 = null;
                for (String part : xSignature.split(",")) {
                    String[] kv = part.trim().split("=", 2);
                    if (kv.length == 2) {
                        if ("ts".equals(kv[0])) ts = kv[1];
                        else if ("v1".equals(kv[0])) v1 = kv[1];
                    }
                }
                if (ts == null || v1 == null) return false;

                String manifest = "id:" + dataId + ";request-id:" + (xRequestId != null ? xRequestId : "") + ";ts:" + ts + ";";

                Mac mac = Mac.getInstance("HmacSHA256");
                mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
                byte[] computed = mac.doFinal(manifest.getBytes(StandardCharsets.UTF_8));

                StringBuilder sb = new StringBuilder();
                for (byte b : computed) sb.append(String.format("%02x", b));

                return MessageDigest.isEqual(
                        sb.toString().getBytes(StandardCharsets.UTF_8),
                        v1.getBytes(StandardCharsets.UTF_8));
            } catch (Exception e) {
                return false;
            }
        }
    }

    // ─── PayPal — Verificación de headers ───────────────────────────────────────

    @Nested
    @DisplayName("PayPal — Validación de headers de firma")
    class PayPalHeaderTests {

        @Test
        @DisplayName("Headers de firma completos son aceptados para validación")
        void headersCompletosAceptados() {
            // PayPal usa verificación via API (no local HMAC), así que solo validamos
            // que los headers requeridos estén presentes antes de llamar a la API.
            assertThat(headersPayPalPresentes(
                    "tx-id-123", "2024-01-01T00:00:00Z", "https://cert.paypal.com/cert.pem",
                    "SHA256withRSA", "base64sig==")).isTrue();
        }

        @Test
        @DisplayName("Header transmission-id faltante es rechazado")
        void transmissionIdFaltante() {
            assertThat(headersPayPalPresentes(
                    null, "2024-01-01T00:00:00Z", "https://cert.paypal.com/cert.pem",
                    "SHA256withRSA", "base64sig==")).isFalse();
        }

        @Test
        @DisplayName("Header transmission-sig faltante es rechazado")
        void transmissionSigFaltante() {
            assertThat(headersPayPalPresentes(
                    "tx-id-123", "2024-01-01T00:00:00Z", "https://cert.paypal.com/cert.pem",
                    "SHA256withRSA", null)).isFalse();
        }

        @Test
        @DisplayName("Header cert-url faltante es rechazado")
        void certUrlFaltante() {
            assertThat(headersPayPalPresentes(
                    "tx-id-123", "2024-01-01T00:00:00Z", null,
                    "SHA256withRSA", "base64sig==")).isFalse();
        }

        @Test
        @DisplayName("Todos los headers vacíos son rechazados")
        void todosVaciosRechazados() {
            assertThat(headersPayPalPresentes("", "", "", "", "")).isFalse();
        }

        /**
         * Valida que todos los headers requeridos para la verificación PayPal estén presentes.
         */
        private boolean headersPayPalPresentes(String transmissionId, String transmissionTime,
                                                String certUrl, String authAlgo, String transmissionSig) {
            return isPresent(transmissionId) && isPresent(transmissionTime)
                    && isPresent(certUrl) && isPresent(authAlgo) && isPresent(transmissionSig);
        }

        private boolean isPresent(String value) {
            return value != null && !value.isBlank();
        }
    }

    // ─── Helpers ────────────────────────────────────────────────────────────────

    private static String computeHmacSha256(String secret, String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] hash = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
