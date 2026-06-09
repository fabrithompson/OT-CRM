import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import model.Cliente;
import model.Mensaje;

/**
 * Test Data Builder para generar historiales de chat sintéticos para evaluar
 * el System Prompt de {@link service.AiAuditService}.
 *
 * Cada método público devuelve un {@link Scenario} con:
 *   - El {@link Cliente} ficticio dueño del hilo
 *   - La lista de {@link Mensaje} en orden cronológico
 *   - Las expectativas de auditoría (qué etapas deberían marcarse cumplidas)
 *
 * Los mensajes NO se persisten: el caller decide si los guarda en la BD
 * (para un test de integración) o si los pasa a una versión testable del
 * servicio (para un unit test del prompt).
 *
 * Convención de timestamps: anclamos a {@link #BASE_TS} y avanzamos en minutos
 * para que el orden cronológico sea determinístico entre runs.
 */
public final class ChatHistoryMockBuilder {

    /** Etapas canónicas del embudo que se usan en los 3 escenarios. */
    public static final String STAGE_PRESENTACION = "Presentación";
    public static final String STAGE_CALIFICACION = "Calificación";
    public static final String STAGE_PROPUESTA    = "Propuesta";

    /** Ancla fija para todos los timestamps generados — evita flakiness por reloj. */
    private static final LocalDateTime BASE_TS = LocalDateTime.of(2026, 6, 8, 10, 0);

    private ChatHistoryMockBuilder() { /* utility class */ }

    // ════════════════════════════════════════════════════════════════════════
    //  Resultado: chat + expectativas
    // ════════════════════════════════════════════════════════════════════════

    public static final class Scenario {
        public final String nombre;
        public final Cliente cliente;
        public final List<Mensaje> mensajes;
        /** Etapas que deberían quedar marcadas como "cumplido" o "no_aplica" (no penalizar). */
        public final List<String> etapasEsperadasOK;
        /** Etapas que deberían quedar marcadas como "incumplido" o "parcial". */
        public final List<String> etapasEsperadasFallidas;

        Scenario(String nombre, Cliente cliente, List<Mensaje> mensajes,
                 List<String> ok, List<String> fallidas) {
            this.nombre = nombre;
            this.cliente = cliente;
            this.mensajes = mensajes;
            this.etapasEsperadasOK = ok;
            this.etapasEsperadasFallidas = fallidas;
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    //  Caso A — Flujo Perfecto
    // ════════════════════════════════════════════════════════════════════════

    /**
     * 6 mensajes: vendedor saluda y se presenta, pregunta necesidad,
     * cliente responde, vendedor envía propuesta con precio.
     * Esperado: Presentación, Calificación, Propuesta → cumplido.
     */
    public static Scenario casoA_flujoPerfecto() {
        Cliente c = clienteFicticio("Laura Gómez", "5491111111111");
        List<Mensaje> msgs = new ArrayList<>();

        msgs.add(msgCliente(c,  0, "Hola, vi su anuncio del paquete a Bariloche"));
        msgs.add(msgVendedor(c, 2, "Ana",
                "¡Hola Laura! Soy Ana de Viajes OT. ¿Cómo estás? Bienvenida 😊"));
        msgs.add(msgVendedor(c, 3, "Ana",
                "Contame, ¿para cuántas personas y qué fechas tenés en mente?"));
        msgs.add(msgCliente(c,  6,
                "Somos 2 adultos, del 15 al 22 de julio. Buscamos hotel 4 estrellas."));
        msgs.add(msgVendedor(c, 9, "Ana",
                "Genial. Te paso la propuesta: paquete 7 noches 4★ con desayuno, "
              + "aéreos incluidos. Total final: USD 1.480 por persona."));
        msgs.add(msgCliente(c, 12,
                "Perfecto, lo veo y te confirmo en el día"));

        return new Scenario(
                "A — Flujo Perfecto",
                c, msgs,
                List.of(STAGE_PRESENTACION, STAGE_CALIFICACION, STAGE_PROPUESTA),
                List.of());
    }

    // ════════════════════════════════════════════════════════════════════════
    //  Caso B — Cliente Acelerado / Salto Válido
    // ════════════════════════════════════════════════════════════════════════

    /**
     * El cliente entrega nombre + necesidad + intención de compra en un solo
     * mensaje largo. El vendedor va directo a la propuesta — NO debería
     * penalizarse por "no haber preguntado", la info ya estaba dada.
     * Esperado: las 3 etapas → cumplido (o no_aplica para Calificación).
     */
    public static Scenario casoB_clienteAcelerado() {
        Cliente c = clienteFicticio("Martín Pérez", "5491122223333");
        List<Mensaje> msgs = new ArrayList<>();

        msgs.add(msgCliente(c, 0,
                "Buen día, soy Martín Pérez. Somos 4 personas (2 adultos y 2 nenes) "
              + "y queremos viajar a Cancún la primera semana de agosto, 7 noches, "
              + "all inclusive. Ya estuvimos averiguando precios en otra agencia, "
              + "necesito que me pasen su mejor cotización para cerrar HOY."));
        msgs.add(msgVendedor(c, 1, "Diego",
                "¡Hola Martín! Soy Diego de Viajes OT. Te armo la propuesta ya mismo."));
        msgs.add(msgVendedor(c, 4, "Diego",
                "Cancún 7 noches all inclusive para 2 adultos + 2 menores, "
              + "salida 1ra semana de agosto: USD 5.890 total con aéreos. "
              + "Te paso el voucher cuando confirmes."));
        msgs.add(msgCliente(c, 7,
                "Buenísimo, lo hablo con mi esposa y te confirmo en un par de horas"));

        return new Scenario(
                "B — Cliente Acelerado",
                c, msgs,
                List.of(STAGE_PRESENTACION, STAGE_CALIFICACION, STAGE_PROPUESTA),
                List.of());
    }

    // ════════════════════════════════════════════════════════════════════════
    //  Caso C — Fallo Real
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Cliente sólo escribe "Hola" y el vendedor manda precio en frío,
     * sin presentarse ni calificar.
     * Esperado: Presentación + Calificación → incumplido. Propuesta → cumplido (mandó precio).
     */
    public static Scenario casoC_falloReal() {
        Cliente c = clienteFicticio("Cliente Anónimo", "5491133334444");
        List<Mensaje> msgs = new ArrayList<>();

        msgs.add(msgCliente(c,  0, "Hola"));
        msgs.add(msgVendedor(c, 1, "Roberto",
                "Mirá, el paquete a Brasil arranca en USD 1.200 por persona."));
        msgs.add(msgCliente(c,  5, "Ok, gracias"));

        return new Scenario(
                "C — Fallo Real",
                c, msgs,
                List.of(STAGE_PROPUESTA),
                List.of(STAGE_PRESENTACION, STAGE_CALIFICACION));
    }

    // ════════════════════════════════════════════════════════════════════════
    //  Helpers de construcción
    // ════════════════════════════════════════════════════════════════════════

    private static Cliente clienteFicticio(String nombre, String telefono) {
        Cliente c = new Cliente();
        c.setNombre(nombre);
        c.setTelefono(telefono);
        c.setFechaRegistro(BASE_TS.minusDays(1));
        return c;
    }

    private static Mensaje msgCliente(Cliente c, int offsetMin, String texto) {
        return mensaje(c, offsetMin, /*esSalida*/ false, /*autor*/ null, texto);
    }

    private static Mensaje msgVendedor(Cliente c, int offsetMin, String autor, String texto) {
        return mensaje(c, offsetMin, /*esSalida*/ true, autor, texto);
    }

    private static Mensaje mensaje(Cliente c, int offsetMin, boolean esSalida,
                                   String autor, String texto) {
        Mensaje m = new Mensaje();
        m.setCliente(c);
        m.setContenido(texto);
        m.setEsSalida(esSalida);
        m.setAutor(autor);
        m.setFechaHora(BASE_TS.plusMinutes(offsetMin));
        m.setTipo(Mensaje.TipoMensaje.TEXTO);
        m.setEstado(Mensaje.EstadoMensaje.ENVIADO);
        return m;
    }
}
