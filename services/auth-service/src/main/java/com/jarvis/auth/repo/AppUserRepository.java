package com.jarvis.auth.repo;

import com.jarvis.auth.domain.AppUser;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppUserRepository extends JpaRepository<AppUser, Long> {

    Optional<AppUser> findByUsername(String username);

    boolean existsByUsername(String username);

    /** The single MVP user (used by the security-question recovery flow). */
    Optional<AppUser> findFirstByOrderByIdAsc();
}
