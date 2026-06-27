package com.jarvis.backend.service;

import com.jarvis.backend.domain.AppUser;
import com.jarvis.backend.domain.UserProfile;
import com.jarvis.backend.repo.AppUserRepository;
import com.jarvis.backend.repo.UserProfileRepository;
import com.jarvis.backend.web.dto.ProfileDto;
import com.jarvis.backend.web.dto.UpdateProfileRequest;
import java.time.Instant;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ProfileService {

    private final UserProfileRepository profiles;
    private final AppUserRepository users;

    public ProfileService(UserProfileRepository profiles, AppUserRepository users) {
        this.profiles = profiles;
        this.users = users;
    }

    @Transactional
    public ProfileDto getOrCreate(String username) {
        return ProfileDto.from(load(username));
    }

    @Transactional
    public ProfileDto update(String username, UpdateProfileRequest req) {
        UserProfile p = load(username);
        if (req.fullName() != null) p.setFullName(req.fullName());
        if (req.email() != null) p.setEmail(req.email());
        if (req.phone() != null) p.setPhone(req.phone());
        if (req.baseCurrency() != null && !req.baseCurrency().isBlank())
            p.setBaseCurrency(req.baseCurrency());
        if (req.city() != null) p.setCity(req.city());
        p.setUpdatedAt(Instant.now());
        return ProfileDto.from(profiles.save(p));
    }

    private UserProfile load(String username) {
        return profiles
            .findByAppUserUsername(username)
            .orElseGet(() -> {
                AppUser user = users
                    .findByUsername(username)
                    .orElseThrow(
                        () -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user"));
                UserProfile p = new UserProfile();
                p.setAppUser(user);
                return profiles.save(p);
            });
    }
}
