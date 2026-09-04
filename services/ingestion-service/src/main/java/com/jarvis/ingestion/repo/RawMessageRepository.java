package com.jarvis.ingestion.repo;

import java.util.List;
import java.util.Collection;
import com.jarvis.ingestion.domain.RawMessage;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RawMessageRepository extends JpaRepository<RawMessage, Long> {

    List<RawMessage> findByTransactionRefIn(Collection<Long> transactionRefs);
}
