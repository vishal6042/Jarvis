package com.jarvis.ai.chat;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One turn in a conversation. An assistant turn may carry a proposed action: the JSON the web app
 * rendered as a card, plus what became of it.
 */
@Entity
@Table(name = "chat_message")
@Getter
@Setter
@NoArgsConstructor
public class ChatMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "session_id", nullable = false)
    private Long sessionId;

    /** {@code user} or {@code assistant}. */
    @Column(nullable = false, length = 16)
    private String role;

    /** "text" is reserved in some SQL dialects, so the column is `body`. */
    @Column(nullable = false, columnDefinition = "text")
    private String body;

    @Column(name = "action_json", columnDefinition = "text")
    private String actionJson;

    /** pending | done | cancelled | failed — only set on a turn that proposed an action. */
    @Column(length = 16)
    private String status;

    @Column(columnDefinition = "text")
    private String result;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();
}
