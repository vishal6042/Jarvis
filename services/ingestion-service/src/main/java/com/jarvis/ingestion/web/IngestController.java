package com.jarvis.ingestion.web;

import com.jarvis.ingestion.service.IngestionService;
import com.jarvis.ingestion.web.dto.IngestRequest;
import com.jarvis.ingestion.web.dto.IngestResponse;
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
