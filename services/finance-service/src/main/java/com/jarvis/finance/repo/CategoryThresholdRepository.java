package com.jarvis.finance.repo;

import com.jarvis.finance.domain.CategoryThreshold;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CategoryThresholdRepository extends JpaRepository<CategoryThreshold, Long> {
    Optional<CategoryThreshold> findByCategory(String category);
}
