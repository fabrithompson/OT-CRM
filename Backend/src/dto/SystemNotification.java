package dto;

public record SystemNotification(
    String title,
    String message,
    String type,      
    String link,      
    long timestamp
) {}