package com.jarvis.finance.repo;

import java.util.Optional;
import com.jarvis.finance.domain.Investment;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InvestmentRepository extends JpaRepository<Investment, Long> {
    List<Investment> findByMemberId(Long memberId);

    List<Investment> findByAccountLast4IsNotNull();

    Optional<Investment> findFirstByAccountLast4(String accountLast4);
}
