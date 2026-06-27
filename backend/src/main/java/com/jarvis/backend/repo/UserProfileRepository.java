package com.jarvis.backend.repo;

import com.jarvis.backend.domain.UserProfile;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserProfileRepository extends JpaRepository<UserProfile, Long> {

    Optional<UserProfile> findByAppUserUsername(String username);
}
