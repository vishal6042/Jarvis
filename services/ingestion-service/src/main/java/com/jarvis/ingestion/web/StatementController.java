package com.jarvis.ingestion.web;

import com.jarvis.ingestion.service.StatementService;
import com.jarvis.ingestion.web.dto.ConfirmStatementRequest;
import com.jarvis.ingestion.web.dto.StatementImportResult;
import com.jarvis.ingestion.web.dto.StatementPreview;
import java.io.IOException;
import java.io.UncheckedIOException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

/**
 * Upload a bank/credit-card statement (PDF / Excel / CSV). The AI extracts it for review
 * ({@code /preview}); the user then confirms ({@code /confirm}) to persist the transactions.
 */
@RestController
@RequestMapping("/api/ingest/statement")
public class StatementController {

    private final StatementService statements;

    public StatementController(StatementService statements) {
        this.statements = statements;
    }

    @PostMapping(path = "/preview", consumes = "multipart/form-data")
    public StatementPreview preview(@RequestParam("file") MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No file uploaded");
        }
        return statements.preview(file);
    }

    /**
     * Streaming scan: NDJSON, one line per event (account, then transaction batches, then done),
     * flushed as parsed so the frontend appends rows live and the request never times out.
     */
    @PostMapping(path = "/preview-stream", consumes = "multipart/form-data", produces = "application/x-ndjson")
    public StreamingResponseBody previewStream(@RequestParam("file") MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No file uploaded");
        }
        return out -> {
            try {
                statements.previewStreaming(file, out);
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        };
    }

    @PostMapping("/confirm")
    public StatementImportResult confirm(@RequestBody ConfirmStatementRequest req) {
        if (req == null || req.transactions() == null || req.transactions().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No transactions to import");
        }
        return statements.confirm(req);
    }
}
