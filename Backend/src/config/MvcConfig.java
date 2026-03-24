package config;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.lang.NonNull;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import security.WebhookInterceptor;

@Configuration
@EnableAsync
public class MvcConfig implements WebMvcConfigurer {

    @Autowired
    private WebhookInterceptor webhookInterceptor;

    @Value("${app.storage.location:/tmp/uploads}")
    private String storageLocation;

    @Override
    public void addResourceHandlers(@NonNull ResourceHandlerRegistry registry) {
        // Uploads — use configurable path
        registry.addResourceHandler("/uploads/**")
                .addResourceLocations("file:" + storageLocation + "/");
        // React static assets
        registry.addResourceHandler("/assets/**")
                .addResourceLocations("file:/app/static/assets/");
        registry.addResourceHandler("/*.js", "/*.css", "/*.ico", "/*.png", "/*.svg")
                .addResourceLocations("file:/app/static/");
    }

    @SuppressWarnings("null")
    @Override
    public void addInterceptors(@NonNull InterceptorRegistry registry) {
        registry.addInterceptor(webhookInterceptor)
                .addPathPatterns("/api/webhook/**", "/api/telegram/webhook/**");
    }
}