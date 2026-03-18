package service;

import java.util.Collections;
import java.util.List;
import java.util.Objects;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

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

    public RespuestaRapida guardar(RespuestaRapida rr, Usuario usuario) {
        if (usuario == null || usuario.getAgencia() == null) {
            throw new IllegalArgumentException("El usuario no pertenece a una agencia.");
        }

        rr.setAgencia(usuario.getAgencia());
        rr.setUsuario(usuario);

        if (rr.getId() == null && repositorio.existsByAgenciaAndAtajo(usuario.getAgencia(), rr.getAtajo())) {
            throw new IllegalArgumentException("El atajo " + rr.getAtajo() + " ya existe en este equipo.");
        }

        return repositorio.save(rr);
    }

    public void eliminar(Long id, Usuario usuario) {
        if (id == null || usuario == null) return;
        RespuestaRapida rr = repositorio.findById(id).orElse(null);
        
        if (rr != null && Objects.equals(rr.getAgencia(), usuario.getAgencia())) {
            repositorio.deleteById(id);
        } else {
            throw new IllegalArgumentException("No tienes permiso para borrar esta respuesta o no existe.");
        }
    }

    public List<RespuestaRapida> listarPorAgencia(Agencia agencia) {
        if (agencia == null) {
            return Collections.emptyList();
        }
        return repositorio.findByAgencia(agencia);
    }
}