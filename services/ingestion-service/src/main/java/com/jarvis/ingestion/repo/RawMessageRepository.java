package com.jarvis.ingestion.repo;

import com.jarvis.ingestion.domain.RawMessage;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RawMessageRepository extends JpaRepository<RawMessage, Long> {
}
