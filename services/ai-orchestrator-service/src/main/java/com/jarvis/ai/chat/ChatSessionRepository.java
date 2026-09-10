package com.jarvis.ai.chat;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChatSessionRepository extends JpaRepository<ChatSession, Long> {

    List<ChatSession> findByUsernameOrderByUpdatedAtDesc(String username);

    /** Every read is by id *and* owner, so nobody can open a chat that is not theirs. */
    Optional<ChatSession> findByIdAndUsername(Long id, String username);
}
