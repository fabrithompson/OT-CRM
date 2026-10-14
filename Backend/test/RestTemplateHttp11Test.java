import static org.assertj.core.api.Assertions.assertThat;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.web.client.RestTemplate;

import config.RestTemplateConfig;

/**
 * El bot de WhatsApp (Node/Express) cierra la conexión cuando recibe el
 * "Upgrade: h2c" que manda por defecto el HttpClient del JDK. El RestTemplate del
 * backend tiene que hablar HTTP/1.1 puro: este test levanta un servidor que se
 * comporta igual que el bot y verifica que el pedido llega y se responde.
 */
class RestTemplateHttp11Test {

    /** Servidor mínimo: si el pedido trae "Upgrade:" cierra sin responder, como Node. */
    private static final class ServidorQueRechazaUpgrade implements AutoCloseable {
        final ServerSocket socket;
        final AtomicBoolean vioUpgrade = new AtomicBoolean(false);
        final Thread hilo;

        ServidorQueRechazaUpgrade() throws IOException {
            socket = new ServerSocket(0, 10, InetAddress.getLoopbackAddress());
            hilo = new Thread(this::atender, "falso-bot");
            hilo.setDaemon(true);
            hilo.start();
        }

        int puerto() {
            return socket.getLocalPort();
        }

        private void atender() {
            while (!socket.isClosed()) {
                try (Socket s = socket.accept()) {
                    BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.ISO_8859_1));
                    StringBuilder cabeceras = new StringBuilder();
                    String linea;
                    while ((linea = in.readLine()) != null && !linea.isEmpty()) {
                        cabeceras.append(linea).append('\n');
                    }
                    if (cabeceras.toString().toLowerCase().contains("upgrade:")) {
                        vioUpgrade.set(true);
                        continue; // cierra sin responder: "header parser received no bytes"
                    }
                    byte[] cuerpo = "{\"status\":\"SCAN_QR\"}".getBytes(StandardCharsets.UTF_8);
                    OutputStream out = s.getOutputStream();
                    out.write(("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: "
                            + cuerpo.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.ISO_8859_1));
                    out.write(cuerpo);
                    out.flush();
                } catch (IOException ignorado) {
                    // el servidor se está cerrando
                }
            }
        }

        @Override
        public void close() throws IOException {
            socket.close();
        }
    }

    @Test
    @DisplayName("El RestTemplate del backend habla HTTP/1.1 sin pedir upgrade a HTTP/2")
    @SuppressWarnings({ "unchecked", "rawtypes" })
    void noPideUpgradeAHttp2() throws Exception {
        RestTemplate http = new RestTemplateConfig().restTemplate(new RestTemplateBuilder());

        try (ServidorQueRechazaUpgrade bot = new ServidorQueRechazaUpgrade()) {
            Map respuesta = http.getForObject("http://127.0.0.1:" + bot.puerto() + "/session/status/x", Map.class);

            assertThat(bot.vioUpgrade.get()).as("no debe mandar Upgrade: h2c").isFalse();
            assertThat(respuesta).isNotNull();
            assertThat(respuesta.get("status")).isEqualTo("SCAN_QR");
        }
    }

    @Test
    @DisplayName("Un POST con cuerpo JSON también llega sin upgrade")
    @SuppressWarnings({ "unchecked", "rawtypes" })
    void postConCuerpoNoPideUpgrade() throws Exception {
        RestTemplate http = new RestTemplateConfig().restTemplate(new RestTemplateBuilder());

        try (ServidorQueRechazaUpgrade bot = new ServidorQueRechazaUpgrade()) {
            Map respuesta = http.postForObject("http://127.0.0.1:" + bot.puerto() + "/session/start",
                    Map.of("sessionId", "abc"), Map.class);

            assertThat(bot.vioUpgrade.get()).isFalse();
            assertThat(respuesta).isNotNull();
        }
    }
}
