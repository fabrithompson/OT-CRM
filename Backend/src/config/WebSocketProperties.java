package config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import lombok.Data;

@Data
@Configuration
@ConfigurationProperties(prefix = "app.websocket")
public class WebSocketProperties {
    private String endpoint = "/ws-crm";
    private String[] allowedOrigins = {"*"};
    private long heartbeatIncoming = 10000;
    private long heartbeatOutgoing = 10000;
    private int schedulerPoolSize = 4; 
    private int messageSizeLimit = 128 * 1024;
    private int bufferSizeLimit = 512 * 1024;  
    private int sendTimeLimit = 20 * 1000; 
}
