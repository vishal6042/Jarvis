package com.jarvis.backend.web;

import com.jarvis.backend.service.IngestionService;
import com.jarvis.backend.web.dto.IngestRequest;
import com.jarvis.backend.web.dto.IngestResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/ingest")
public class IngestController {

    private final IngestionService ingestion;

    public IngestController(IngestionService ingestion) {
        this.ingestion = ingestion;
    }

    @PostMapping
    public IngestResponse ingest(@Valid @RequestBody IngestRequest req) {
        return ingestion.ingest(req);
    }
}
