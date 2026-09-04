package com.jarvis.ingestion.web;

import com.jarvis.ingestion.repo.RawMessageRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.RestController;

/** GDPR-style purge: delete all stored raw import/alert messages. */
@RestController
public class DataController {

    private final RawMessageRepository rawMessages;

    public DataController(RawMessageRepository rawMessages) {
        this.rawMessages = rawMessages;
    }

    @DeleteMapping("/api/ingest/purge-all")
    @Transactional
    public ResponseEntity<Void> purge() {
        rawMessages.deleteAllInBatch();
        return ResponseEntity.noContent().build();
    }
}
