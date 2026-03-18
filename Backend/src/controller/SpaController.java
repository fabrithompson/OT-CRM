package controller;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SpaController {

    @RequestMapping(value = "/")
    public ResponseEntity<byte[]> root() throws IOException {
        return serveIndex();
    }

    @RequestMapping(value = {
        "/{path:^(?!api|assets|uploads|ws-crm|actuator)[^\\.]*}",
        "/{path:^(?!api|assets|uploads|ws-crm|actuator)[^\\.]*}/**"
    })
    public ResponseEntity<byte[]> spa(@PathVariable String path) throws IOException {
        return serveIndex();
    }

    @SuppressWarnings("null")
    private ResponseEntity<byte[]> serveIndex() throws IOException {
        byte[] content = Files.readAllBytes(Paths.get("/app/static/index.html"));
        return ResponseEntity.ok()
                .contentType(MediaType.TEXT_HTML)
                .body(content);
    }
}