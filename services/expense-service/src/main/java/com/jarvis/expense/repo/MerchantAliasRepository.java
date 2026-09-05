package com.jarvis.expense.repo;

import com.jarvis.expense.domain.MerchantAlias;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MerchantAliasRepository extends JpaRepository<MerchantAlias, Long> {

    Optional<MerchantAlias> findByRaw(String raw);
}
