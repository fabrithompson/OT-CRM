package service;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import model.Plan;
import repository.PlanRepository;

@Component
public class PlanPriceScheduler {

    private static final Logger log = LoggerFactory.getLogger(PlanPriceScheduler.class);

    private final PlanRepository planRepository;
    private final CurrencyService currencyService;

    public PlanPriceScheduler(PlanRepository planRepository, CurrencyService currencyService) {
        this.planRepository = planRepository;
        this.currencyService = currencyService;
    }

    @Scheduled(cron = "0 0 8 * * *")
    @Transactional
    public void actualizarPreciosSugeridosPayPal() {
        log.info("Iniciando actualización diaria de conversión ARS -> USD...");

        double cotizacionHoy = currencyService.getCotizacionDolar();
        List<Plan> planes = planRepository.findAll();

        for (Plan plan : planes) {
            if (plan.getPrecioMensual() > 0) {
                double precioUsd = currencyService.convertirArsToUsd(plan.getPrecioMensual());

                log.info("Plan {}: {} ARS equivale hoy a {} USD (Tasa: {})",
                        plan.getNombre(), plan.getPrecioMensual(), precioUsd, cotizacionHoy);

            }
        }

        log.info("✅ Sincronización de precios finalizada.");
    }
}