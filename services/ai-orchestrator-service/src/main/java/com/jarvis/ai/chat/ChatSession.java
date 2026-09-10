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

/** One conversation with the assistant, belonging to the user who started it. */
@Entity
@Table(name = "chat_session")
@Getter
@Setter
@NoArgsConstructor
public class ChatSession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 120)
    private String username;

    /** Set from the first question asked; until then, the placeholder a new chat starts with. */
    @Column(nullable = false, length = 160)
    private String title;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    /** Bumped on every turn, so the list orders by "last talked to". */
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();
}
