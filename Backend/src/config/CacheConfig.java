package config;

import java.util.concurrent.TimeUnit;

import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

import com.github.benmanes.caffeine.cache.Caffeine;

@Configuration
@EnableCaching
public class CacheConfig {

    /**
     * Caché de Caffeine con TTL de 30s. Esto evita que un cambio manual del
     * plan_id en la base de datos quede "atrapado" en memoria indefinidamente.
     * Si el usuario edita su plan directo en Railway, en menos de 30s el cache
     * expira y la próxima request re-lee de la DB.
     *
     * Los endpoints que cambian el plan a través del CRM siguen llamando
     * @CacheEvict, así que para esos casos la actualización es inmediata.
     */
    @Primary
    @Bean
    public CacheManager cacheManager() {
        CaffeineCacheManager manager = new CaffeineCacheManager();
        manager.setCaffeine(Caffeine.newBuilder()
                .expireAfterWrite(30, TimeUnit.SECONDS)
                .maximumSize(1_000));
        return manager;
    }
}
