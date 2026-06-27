package com.jarvis.backend.repo;

import com.jarvis.backend.domain.Account;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AccountRepository extends JpaRepository<Account, Long> {

    /** Accounts whose number ends in these 4 digits (used to match alerts to an account). */
    List<Account> findByLast4(String last4);

    Optional<Account> findByBankIgnoreCaseAndLast4(String bank, String last4);
}
