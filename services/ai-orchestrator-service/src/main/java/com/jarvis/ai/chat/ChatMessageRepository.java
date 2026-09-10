package com.jarvis.ai.chat;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {

    List<ChatMessage> findBySessionIdOrderByIdAsc(Long sessionId);

    long countBySessionId(Long sessionId);

    /** By message id *and* session, so a message can only be touched through its own chat. */
    Optional<ChatMessage> findByIdAndSessionId(Long id, Long sessionId);
}
