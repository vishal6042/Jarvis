package com.jarvis.ingestion.web;

import com.jarvis.ingestion.service.StatementService;
import com.jarvis.ingestion.web.dto.StatementImportResult;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

/** Upload a bank/credit-card statement (PDF/CSV); the AI extracts and persists its transactions. */
@RestController
@RequestMapping("/api/ingest/statement")
public class StatementController {

    private final StatementService statements;

    public StatementController(StatementService statements) {
        this.statements = statements;
    }

    @PostMapping(consumes = "multipart/form-data")
    public StatementImportResult upload(@RequestParam("file") MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No file uploaded");
        }
        return statements.importStatement(file);
    }
}
