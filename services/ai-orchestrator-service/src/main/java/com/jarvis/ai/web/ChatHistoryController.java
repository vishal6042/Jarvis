package com.jarvis.ai.web;

import com.jarvis.ai.chat.ChatHistoryService;
import com.jarvis.ai.chat.ChatMessage;
import com.jarvis.ai.chat.ChatSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.time.Instant;
import java.util.List;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Saved conversations, all under the signed-in user:
 *  - {@code GET    /api/ai/chats}                       — the list, newest first.
 *  - {@code POST   /api/ai/chats}                       — start one.
 *  - {@code GET    /api/ai/chats/{id}}                  — reopen one, in full.
 *  - {@code POST   /api/ai/chats/{id}/messages}         — record a turn.
 *  - {@code PATCH  /api/ai/chats/{id}/messages/{msgId}} — what became of a proposed action.
 *  - {@code DELETE /api/ai/chats/{id}}                  — forget it.
 *
 * The web app writes each turn as it happens rather than the server persisting inside
 * {@code /api/ai/chat}, because not every turn comes from there: the planner, the local fallback
 * answers and the errors are all part of the same conversation and are all worth keeping.
 */
@RestController
@RequestMapping("/api/ai/chats")
public class ChatHistoryController {

    private final ChatHistoryService history;

    public ChatHistoryController(ChatHistoryService history) {
        this.history = history;
    }

    @GetMapping
    public List<ChatSummary> list() {
        return history.list().stream()
            .map(s -> new ChatSummary(
                s.getId(), s.getTitle(), s.getUpdatedAt(), history.messageCount(s.getId())))
            .toList();
    }

    @PostMapping
    public ChatSummary start() {
        ChatSession session = history.start();
        return new ChatSummary(session.getId(), session.getTitle(), session.getUpdatedAt(), 0);
    }

    @GetMapping("/{id}")
    public ChatTranscript transcript(@PathVariable Long id) {
        ChatSession session = history.session(id);
        List<Turn> turns = history.transcript(id).stream().map(ChatHistoryController::toTurn).toList();
        return new ChatTranscript(session.getId(), session.getTitle(), session.getUpdatedAt(), turns);
    }

    @PostMapping("/{id}/messages")
    public Turn append(@PathVariable Long id, @Valid @RequestBody TurnRequest req) {
        return toTurn(history.append(
            id, req.role(), req.body(), req.actionJson(), req.status(), req.result()));
    }

    @PatchMapping("/{id}/messages/{messageId}")
    public Turn settle(
        @PathVariable Long id, @PathVariable Long messageId, @RequestBody SettleRequest req) {
        return toTurn(history.settle(id, messageId, req.status(), req.result()));
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        history.delete(id);
    }

    private static Turn toTurn(ChatMessage m) {
        return new Turn(
            m.getId(), m.getRole(), m.getBody(), m.getActionJson(), m.getStatus(), m.getResult(),
            m.getCreatedAt());
    }

    public record ChatSummary(Long id, String title, Instant updatedAt, long messages) {}

    public record ChatTranscript(Long id, String title, Instant updatedAt, List<Turn> messages) {}

    /** {@code actionJson} is the proposed action verbatim, so the card can be rebuilt as it was. */
    public record Turn(
        Long id, String role, String body, String actionJson, String status, String result,
        Instant at) {}

    public record TurnRequest(
        @NotBlank String role, @NotBlank String body, String actionJson, String status,
        String result) {}

    public record SettleRequest(String status, String result) {}
}
