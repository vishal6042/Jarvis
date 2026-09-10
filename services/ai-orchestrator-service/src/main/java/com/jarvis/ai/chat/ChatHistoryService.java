package com.jarvis.ai.chat;

import com.jarvis.common.security.Caller;
import com.jarvis.common.security.CallerContext;
import java.time.Instant;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Saved conversations: list them, reopen one, carry it on, delete it.
 *
 * Ownership is enforced on every path by looking a chat up by id *and* the signed-in username, so a
 * guessed id returns 404 rather than someone else's money questions. That is deliberately stricter
 * than the rest of the app: an administrator can see the household's finances, but not the private
 * conversations of the people in it.
 */
@Service
public class ChatHistoryService {

    /** What a chat is called until its first question names it. */
    static final String UNTITLED = "New chat";

    private static final int TITLE_MAX = 160;

    private final ChatSessionRepository sessions;
    private final ChatMessageRepository messages;

    public ChatHistoryService(ChatSessionRepository sessions, ChatMessageRepository messages) {
        this.sessions = sessions;
        this.messages = messages;
    }

    /** The signed-in user. Absent only if this were ever reachable without a token. */
    private String caller() {
        return CallerContext.current()
            .map(Caller::username)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not signed in"));
    }

    private ChatSession mine(Long sessionId) {
        return sessions.findByIdAndUsername(sessionId, caller())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such chat"));
    }

    @Transactional(readOnly = true)
    public List<ChatSession> list() {
        return sessions.findByUsernameOrderByUpdatedAtDesc(caller());
    }

    public long messageCount(Long sessionId) {
        return messages.countBySessionId(sessionId);
    }

    @Transactional
    public ChatSession start() {
        ChatSession session = new ChatSession();
        session.setUsername(caller());
        session.setTitle(UNTITLED);
        return sessions.save(session);
    }

    @Transactional(readOnly = true)
    public List<ChatMessage> transcript(Long sessionId) {
        return messages.findBySessionIdOrderByIdAsc(mine(sessionId).getId());
    }

    @Transactional(readOnly = true)
    public ChatSession session(Long sessionId) {
        return mine(sessionId);
    }

    /**
     * Record one turn. The first thing the user says also names the chat — a list of "New chat"
     * rows would be no more use than no list at all.
     */
    @Transactional
    public ChatMessage append(
        Long sessionId, String role, String body, String actionJson, String status, String result) {

        ChatSession session = mine(sessionId);

        ChatMessage message = new ChatMessage();
        message.setSessionId(session.getId());
        message.setRole(role);
        message.setBody(body);
        message.setActionJson(actionJson);
        message.setStatus(status);
        message.setResult(result);
        ChatMessage saved = messages.save(message);

        if ("user".equals(role) && UNTITLED.equals(session.getTitle())) {
            session.setTitle(titleFrom(body));
        }
        session.setUpdatedAt(Instant.now());
        sessions.save(session);
        return saved;
    }

    /** After the user confirms or cancels a proposed action, so a reopened chat shows what happened. */
    @Transactional
    public ChatMessage settle(Long sessionId, Long messageId, String status, String result) {
        ChatSession session = mine(sessionId);
        ChatMessage message = messages.findByIdAndSessionId(messageId, session.getId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such message"));
        message.setStatus(status);
        message.setResult(result);
        session.setUpdatedAt(Instant.now());
        sessions.save(session);
        return messages.save(message);
    }

    @Transactional
    public void delete(Long sessionId) {
        // The messages go with it: the FK is ON DELETE CASCADE.
        sessions.delete(mine(sessionId));
    }

    /** One line, on a word boundary where there is one — this is a label, not a summary. */
    private static String titleFrom(String body) {
        String flat = body.strip().replaceAll("\\s+", " ");
        if (flat.length() <= 60) {
            return flat.isEmpty() ? UNTITLED : flat;
        }
        String cut = flat.substring(0, 60);
        int space = cut.lastIndexOf(' ');
        String trimmed = (space > 30 ? cut.substring(0, space) : cut) + "…";
        return trimmed.length() > TITLE_MAX ? trimmed.substring(0, TITLE_MAX) : trimmed;
    }
}
