package service;

import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

@Service
public class CurrencyService {
    private final RestTemplate restTemplate = new RestTemplate();
    private static final String API_URL = "https://dolarapi.com/v1/dolares/tarjeta";

    public double getCotizacionDolar() {
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> resp = restTemplate.getForObject(API_URL, Map.class);
            if (resp != null && resp.containsKey("venta")) {
                return Double.parseDouble(resp.get("venta").toString());
            }
        } catch (NumberFormatException | RestClientException e) {
            return 1000.0;
        }
        return 1000.0;
    }

    public double convertirArsToUsd(double precioArs) {
        double cotizacion = getCotizacionDolar();
        return Math.round((precioArs / cotizacion) * 100.0) / 100.0;
    }
}