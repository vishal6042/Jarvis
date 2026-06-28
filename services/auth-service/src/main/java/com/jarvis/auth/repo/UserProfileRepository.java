package com.jarvis.auth.repo;

import com.jarvis.auth.domain.UserProfile;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserProfileRepository extends JpaRepository<UserProfile, Long> {

    Optional<UserProfile> findByAppUserUsername(String username);
}
