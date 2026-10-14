package service;

import java.util.Collections;
import java.util.List;
import java.util.Objects;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import model.Agencia;
import model.RespuestaRapida;
import model.Usuario;
import repository.RespuestaRapidaRepository;

@Service
public class RespuestaRapidaService {

    @Autowired
    private RespuestaRapidaRepository repositorio;

    public List<RespuestaRapida> listarPorUsuario(Usuario usuario) {
        if (usuario == null || usuario.getAgencia() == null) {
            return Collections.emptyList();
        }
        return repositorio.findByAgencia(usuario.getAgencia());
    }

    /**
     * Crea una respuesta nueva. Solo se toman atajo y respuesta del cuerpo: un id
     * enviado por el cliente se ignora, así no se puede pisar una respuesta existente.
     */
    @Transactional
    public RespuestaRapida crear(RespuestaRapida datos, Usuario usuario) {
        exigirAgencia(usuario);

        if (repositorio.existsByAgenciaAndAtajo(usuario.getAgencia(), datos.getAtajo())) {
            throw new IllegalArgumentException("El atajo " + datos.getAtajo() + " ya existe en este equipo.");
        }

        RespuestaRapida nueva = new RespuestaRapida();
        nueva.setAtajo(datos.getAtajo());
        nueva.setRespuesta(datos.getRespuesta());
        nueva.setAgencia(usuario.getAgencia());
        nueva.setUsuario(usuario);
        return repositorio.save(nueva);
    }

    /**
     * Edita una respuesta de la agencia del usuario. Una de otra agencia responde
     * igual que una inexistente (404). Solo se copian atajo y respuesta.
     */
    @Transactional
    public RespuestaRapida actualizar(Long id, RespuestaRapida datos, Usuario usuario) {
        exigirAgencia(usuario);

        RespuestaRapida existente = repositorio.findById(id)
                .filter(rr -> rr.getAgencia() != null
                        && Objects.equals(rr.getAgencia().getId(), usuario.getAgencia().getId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Respuesta rápida no encontrada"));

        boolean cambiaAtajo = !Objects.equals(existente.getAtajo(), datos.getAtajo());
        if (cambiaAtajo && repositorio.existsByAgenciaAndAtajo(usuario.getAgencia(), datos.getAtajo())) {
            throw new IllegalArgumentException("El atajo " + datos.getAtajo() + " ya existe en este equipo.");
        }

        existente.setAtajo(datos.getAtajo());
        existente.setRespuesta(datos.getRespuesta());
        return repositorio.save(existente);
    }

    private void exigirAgencia(Usuario usuario) {
        if (usuario == null || usuario.getAgencia() == null) {
            throw new IllegalArgumentException("El usuario no pertenece a una agencia.");
        }
    }

    /**
     * Borra una respuesta de la agencia del usuario. Se compara por id de agencia:
     * Agencia no define equals(), así que comparar los objetos nunca coincidía y
     * nadie podía borrar. Una respuesta ajena responde igual que una inexistente.
     */
    @Transactional
    public void eliminar(Long id, Usuario usuario) {
        exigirAgencia(usuario);

        RespuestaRapida rr = repositorio.findById(id)
                .filter(r -> r.getAgencia() != null
                        && Objects.equals(r.getAgencia().getId(), usuario.getAgencia().getId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Respuesta rápida no encontrada"));

        repositorio.delete(rr);
    }

    public List<RespuestaRapida> listarPorAgencia(Agencia agencia) {
        if (agencia == null) {
            return Collections.emptyList();
        }
        return repositorio.findByAgencia(agencia);
    }
}