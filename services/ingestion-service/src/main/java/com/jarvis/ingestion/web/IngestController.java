package com.jarvis.ingestion.web;

import com.jarvis.ingestion.web.dto.ReprocessResult;
import com.jarvis.ingestion.web.dto.RetryRequest;
import java.util.List;
import com.jarvis.ingestion.service.IngestionService;
import com.jarvis.ingestion.web.dto.IngestRequest;
import com.jarvis.ingestion.web.dto.IngestResponse;
import com.jarvis.common.security.CallerContext;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

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

    /**
     * Re-run every stored alert whose transaction has no account, so accounts added or matching
     * improved after the fact get linked. Slow (one AI parse per alert) — call deliberately.
     *
     * <p>It rewrites alerts belonging to the whole household, so it is the administrator's to run.
     */
    @PostMapping("/reprocess-unlinked")
    public ReprocessResult reprocessUnlinked() {
        if (!CallerContext.isAdmin()) {
            throw new ResponseStatusException(
                HttpStatus.FORBIDDEN, "Only the household administrator can re-run this.");
        }
        return ingestion.reprocessUnlinked();
    }

    /**
     * Read again the alerts the parser could not (the model was down, or it missed the amount).
     * Each is re-run in place, so a retry never leaves a second copy of the alert behind.
     *
     * <p>Naming no ids retries every failed alert in the household, so that is the
     * administrator's; anyone may retry the ids their own phone was given back.
     */
    @PostMapping("/retry")
    public List<IngestResponse> retry(@RequestBody(required = false) RetryRequest req) {
        List<Long> ids = req == null || req.ids() == null ? List.of() : req.ids();
        if (ids.isEmpty() && !CallerContext.isAdmin()) {
            throw new ResponseStatusException(
                HttpStatus.FORBIDDEN, "Name the alerts to retry; only the administrator can retry all of them.");
        }
        return ingestion.retryFailed(ids);
    }
}
