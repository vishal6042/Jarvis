package com.jarvis.ai.web;

import com.jarvis.ai.agent.ParsedTransaction;
import com.jarvis.ai.agent.QueryAgent;
import com.jarvis.ai.agent.StatementParseResult;
import com.jarvis.ai.agent.StatementParserAgent;
import com.jarvis.ai.agent.TransactionParser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * The orchestration surface:
 *  - {@code POST /internal/ai/parse}           — service-to-service: parse one alert.
 *  - {@code POST /internal/ai/parse-statement} — service-to-service: scan a statement chunk.
 *  - {@code POST /api/ai/chat}                 — end-user NL Q&A (JWT via the gateway).
 */
@RestController
public class AiController {

    private final TransactionParser parser;
    private final StatementParserAgent statementParser;
    private final QueryAgent queryAgent;
    private final String internalKey;

    public AiController(
        TransactionParser parser,
        StatementParserAgent statementParser,
        QueryAgent queryAgent,
        @Value("${jarvis.internal.key}") String internalKey) {
        this.parser = parser;
        this.statementParser = statementParser;
        this.queryAgent = queryAgent;
        this.internalKey = internalKey;
    }

    @PostMapping("/internal/ai/parse")
    public ParsedTransaction parse(
        @RequestHeader(value = "X-Internal-Key", required = false) String key,
        @Valid @RequestBody ParseRequest req) {
        requireInternal(key);
        return parser.parse(req.text());
    }

    @PostMapping("/internal/ai/parse-statement")
    public StatementParseResult parseStatement(
        @RequestHeader(value = "X-Internal-Key", required = false) String key,
        @Valid @RequestBody ParseRequest req) {
        requireInternal(key);
        return statementParser.parse(req.text());
    }

    private void requireInternal(String key) {
        if (!internalKey.equals(key)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bad internal key");
        }
    }

    @PostMapping("/api/ai/chat")
    public ChatReply chat(@Valid @RequestBody ChatRequest req) {
        return new ChatReply(queryAgent.ask(req.message()));
    }

    public record ParseRequest(@NotBlank String text) {}

    public record ChatRequest(@NotBlank String message) {}

    public record ChatReply(String answer) {}
}
