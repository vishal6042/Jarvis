package com.jarvis.expense.repo;

import com.jarvis.expense.domain.CategoryRule;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CategoryRuleRepository extends JpaRepository<CategoryRule, Long> {

    List<CategoryRule> findAllByOrderByCreatedAtAsc();
}
