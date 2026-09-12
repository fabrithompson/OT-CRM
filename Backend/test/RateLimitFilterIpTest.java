import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.lang.reflect.Field;
import java.lang.reflect.Method;

import org.junit.jupiter.api.Test;

import jakarta.servlet.http.HttpServletRequest;
import security.RateLimitFilter;

/**
 * Cubre el item P1 "endurecer el rate limiting" de docs/backlog-mejoras.md:
 * CF-Connecting-IP solo se confía si Cloudflare es el único camino de entrada
 * (app.security.trust-cloudflare-header), no por default.
 *
 * getClientIp() es privado (no hay bean que exponga esto para un test HTTP
 * liviano), así que se invoca por reflexión en vez de armar un test de
 * integración completo solo para esto.
 */
class RateLimitFilterIpTest {

    private String getClientIp(RateLimitFilter filter, HttpServletRequest request) throws Exception {
        Method m = RateLimitFilter.class.getDeclaredMethod("getClientIp", HttpServletRequest.class);
        m.setAccessible(true);
        return (String) m.invoke(filter, request);
    }

    private void setTrustCloudflareHeader(RateLimitFilter filter, boolean value) throws Exception {
        Field f = RateLimitFilter.class.getDeclaredField("trustCloudflareHeader");
        f.setAccessible(true);
        f.set(filter, value);
    }

    @Test
    void porDefectoIgnoraCfConnectingIpYUsaXForwardedFor() throws Exception {
        RateLimitFilter filter = new RateLimitFilter();
        // trustCloudflareHeader queda en su default de campo (false) al no
        // setearlo — @Value nunca corre fuera de un contexto Spring.

        HttpServletRequest req = mock(HttpServletRequest.class);
        when(req.getHeader("CF-Connecting-IP")).thenReturn("1.2.3.4"); // atacante lo manda igual
        when(req.getHeader("X-Forwarded-For")).thenReturn("5.6.7.8, 9.9.9.9");

        assertThat(getClientIp(filter, req)).isEqualTo("5.6.7.8");
    }

    @Test
    void porDefectoIgnoraCfConnectingIpYCaeARemoteAddrSiNoHayXForwardedFor() throws Exception {
        RateLimitFilter filter = new RateLimitFilter();

        HttpServletRequest req = mock(HttpServletRequest.class);
        when(req.getHeader("CF-Connecting-IP")).thenReturn("1.2.3.4");
        when(req.getRemoteAddr()).thenReturn("10.0.0.1");

        assertThat(getClientIp(filter, req)).isEqualTo("10.0.0.1");
    }

    @Test
    void conElFlagActivadoUsaCfConnectingIp() throws Exception {
        RateLimitFilter filter = new RateLimitFilter();
        setTrustCloudflareHeader(filter, true);

        HttpServletRequest req = mock(HttpServletRequest.class);
        when(req.getHeader("CF-Connecting-IP")).thenReturn("1.2.3.4");

        assertThat(getClientIp(filter, req)).isEqualTo("1.2.3.4");
    }
}
