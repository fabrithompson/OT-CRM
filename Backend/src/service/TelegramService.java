package service;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import model.Agencia;
import model.Cliente;
import model.Dispositivo;
import model.Etapa;
import model.Mensaje;
import repository.ClienteRepository;
import repository.DispositivoRepository;
import repository.EtapaRepository;
import repository.MensajeRepository;

@Service
@RequiredArgsConstructor
public class TelegramService {

    private static final Logger log = LoggerFactory.getLogger(TelegramService.class);

    private final ClienteRepository clienteRepository;
    private final MensajeRepository mensajeRepository;
    private final EtapaRepository etapaRepository;
    private final DispositivoRepository dispositivoRepository;
    private final SimpMessagingTemplate messaging;

    @Transactional
    public void procesarMensajeEntrante(String deviceSessionId, String telegramId, String senderName, String senderPhone, String text) {
        try {
            if (deviceSessionId == null) {
                log.error("SessionID nulo recibido en TelegramService");
                return;
            }

            Optional<Dispositivo> dispOpt = dispositivoRepository.findBySessionId(deviceSessionId);

            if (dispOpt.isEmpty()) {
                log.error("Mensaje huérfano. El dispositivo {} no existe en BD.", deviceSessionId);
                return;
            }

            Dispositivo dispositivo = dispOpt.get();
            Agencia agencia = dispositivo.getAgencia();

            if (agencia == null) {
                log.error("El dispositivo {} no tiene agencia asignada.", deviceSessionId);
                return;
            }

            String telefonoFinal = (senderPhone != null && !senderPhone.isEmpty()) ? limpiarTelefono(senderPhone) : telegramId;
            String nombreFinal = (senderName != null) ? senderName : "Usuario Telegram";

            Optional<Cliente> clienteOpt = clienteRepository.findByAgenciaIdAndTelefono(agencia.getId(), telefonoFinal);
            Cliente cliente;

            if (clienteOpt.isPresent()) {
                cliente = clienteOpt.get();
                log.info("Cliente existente: {}", cliente.getNombre());
            } else {
                log.info("Creando NUEVO Cliente Telegram...");
                cliente = new Cliente();
                cliente.setNombre(nombreFinal);
                cliente.setTelefono(telefonoFinal);
                cliente.setFechaRegistro(LocalDateTime.now());
                cliente.setNotas("Lead desde Telegram");
                cliente.setMensajesSinLeer(0);
                cliente.setSaldo(0.0);
                cliente.setAgencia(agencia);
                cliente.setDispositivo(dispositivo);
                cliente.setFotoUrl("https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg");

                Etapa etapa = etapaRepository.findFirstByAgenciaIdOrderByOrdenAsc(agencia.getId());
                if (etapa == null) {
                    etapa = new Etapa("Nuevos Leads", 1, true);
                    etapa.setAgencia(agencia);
                    etapa = etapaRepository.save(etapa);
                }
                cliente.setEtapa(etapa);

                cliente = clienteRepository.save(cliente);
            }

            Mensaje mensaje = new Mensaje();
            mensaje.setCliente(cliente);
            mensaje.setContenido(text != null ? text : "");
            mensaje.setEsSalida(false);
            mensaje.setFechaHora(LocalDateTime.now());
            mensaje.setWhatsappId("TG_" + System.currentTimeMillis());
            mensaje.setTipo(Mensaje.TipoMensaje.TEXTO);
            mensaje.setEstado(Mensaje.EstadoMensaje.DELIVERED);

            mensajeRepository.save(mensaje);
            cliente.setUltimoMensajeResumen(text);
            cliente.setUltimoMensajeFecha(LocalDateTime.now());
            cliente.setMensajesSinLeer(cliente.getMensajesSinLeer() + 1);
            clienteRepository.save(cliente);

            notificarCambio(cliente, mensaje, false);

            log.info("Mensaje Telegram procesado y notificado.");

        } catch (Exception e) {
            log.error("Error procesando logica Telegram: ", e);
        }
    }

    @SuppressWarnings("null")
    private void notificarCambio(Cliente c, Mensaje m, boolean esSalida) {
        Long clienteId = Objects.requireNonNull(c.getId(), "Cliente ID es nulo");
        Agencia agencia = c.getAgencia();

        if (agencia == null || agencia.getId() == null) {
            log.warn("No se puede notificar: Agencia nula para cliente {}", clienteId);
            return;
        }

        Map<String, Object> chatEv = Map.of(
                "contenido", m.getContenido() != null ? m.getContenido() : "",
                "inbound", !esSalida,
                "fecha", m.getFechaHora().toString(),
                "tipo", "TEXTO",
                "urlArchivo", ""
        );

        messaging.convertAndSend("/topic/chat/" + clienteId, chatEv);

        Map<String, Object> kanbanEv = Map.of(
                "clienteId", clienteId,
                "nombre", c.getNombre() != null ? c.getNombre() : "Sin Nombre",
                "ultimoMensaje", "(TG) " + (c.getUltimoMensajeResumen() != null ? c.getUltimoMensajeResumen() : ""),
                "mensajesSinLeer", c.getMensajesSinLeer(),
                "avatarUrl", c.getFotoUrl() != null ? c.getFotoUrl() : ""
        );

        messaging.convertAndSend("/topic/embudo/" + agencia.getId(), kanbanEv);
    }

    private String limpiarTelefono(String tel) {
        return tel.replaceAll("\\D", "");
    }
}
