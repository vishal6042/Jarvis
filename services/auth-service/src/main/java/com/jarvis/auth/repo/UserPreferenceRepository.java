package com.jarvis.auth.repo;

import com.jarvis.auth.domain.UserPreference;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserPreferenceRepository extends JpaRepository<UserPreference, Long> {

    List<UserPreference> findByAppUser_Username(String username);

    Optional<UserPreference> findByAppUser_UsernameAndPrefKey(String username, String prefKey);
}
