package repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import model.MensajeCampania;

@Repository
public interface MensajeCampaniaRepository extends JpaRepository<MensajeCampania, Long> {

    List<MensajeCampania> findByContactoIdOrderByFechaAsc(Long contactoId);

    /**
     * Lista los contactos con al menos un mensaje, ordenados por la última
     * actividad (más reciente primero). Devuelve [contacto_id, ultima_fecha,
     * no_leidos]. Se usa para construir la bandeja lateral del chat.
     */
    @Query(value =
        "SELECT m.contacto_id, MAX(m.fecha) AS ultima, " +
        "       SUM(CASE WHEN m.direccion = 'IN' AND m.leido = false THEN 1 ELSE 0 END) AS no_leidos " +
        "FROM mensajes_campania m " +
        "WHERE m.dispositivo_id = :dispositivoId " +
        "GROUP BY m.contacto_id " +
        "ORDER BY ultima DESC",
        nativeQuery = true)
    List<Object[]> findBandejaByDispositivo(@Param("dispositivoId") Long dispositivoId);

    @Modifying
    @Query("UPDATE MensajeCampania m SET m.leido = true " +
           "WHERE m.contacto.id = :contactoId AND m.direccion = model.MensajeCampania.Direccion.IN AND m.leido = false")
    int marcarLeidosByContacto(@Param("contactoId") Long contactoId);
}
