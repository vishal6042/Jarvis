package com.jarvis.backend.repo;

import com.jarvis.backend.domain.RawMessage;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RawMessageRepository extends JpaRepository<RawMessage, Long> {
}
