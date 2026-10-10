package com.jarvis.ingestion.repo;

import java.util.List;
import java.util.Collection;
import java.util.Optional;
import com.jarvis.ingestion.domain.ParseStatus;
import com.jarvis.ingestion.domain.RawMessage;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RawMessageRepository extends JpaRepository<RawMessage, Long> {

    List<RawMessage> findByTransactionRefIn(Collection<Long> transactionRefs);

    List<RawMessage> findByStatusOrderByIdAsc(ParseStatus status);

    /** Every alert quoting this text — used to find the alerts that share one payment reference. */
    List<RawMessage> findByPayloadContaining(String text);

    /** The earliest arrival of this same alert that already counted for something, if any. */
    Optional<RawMessage> findFirstByPayloadHashAndStatusInOrderByIdAsc(
        String payloadHash, Collection<ParseStatus> statuses);
}
