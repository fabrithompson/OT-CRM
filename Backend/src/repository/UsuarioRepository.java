package repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import model.Agencia;
import model.Usuario;

@Repository
public interface UsuarioRepository extends JpaRepository<Usuario, Long> {
    @Query("SELECT u FROM Usuario u JOIN FETCH u.agencia WHERE u.username = :username")
    Optional<Usuario> findByUsernameWithAgencia(@Param("username") String username);

    Optional<Usuario> findByUsername(String username);

    Optional<Usuario> findByEmail(String email);

    boolean existsByEmail(String email);

    List<Usuario> findAllByRolNot(String rol);

    List<Usuario> findByAgencia(Agencia agencia);

    long countByAgencia(Agencia agencia);

    List<Usuario> findByAgenciaId(Long agenciaId);

    List<Usuario> findAllByAgenciaId(Long agenciaId);

    @Query("SELECT u FROM Usuario u JOIN FETCH u.plan WHERE u.agencia.id = :agenciaId AND u.rol = 'ADMIN'")
    Optional<Usuario> findAdminByAgenciaId(@Param("agenciaId") Long agenciaId);
}
