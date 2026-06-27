package com.jarvis.backend.config;

import com.jarvis.backend.domain.AppUser;
import com.jarvis.backend.repo.AppUserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/** Seeds the single MVP user (from config) on first start if it doesn't exist yet. */
@Component
public class UserSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(UserSeeder.class);

    private final AppUserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final String username;
    private final String password;

    public UserSeeder(
        AppUserRepository users,
        PasswordEncoder passwordEncoder,
        @Value("${jarvis.security.username}") String username,
        @Value("${jarvis.security.password}") String password) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.username = username;
        this.password = password;
    }

    @Override
    public void run(String... args) {
        if (users.existsByUsername(username)) {
            return;
        }
        AppUser user = new AppUser();
        user.setUsername(username);
        user.setPasswordHash(passwordEncoder.encode(password));
        user.setRoles("USER");
        users.save(user);
        log.info("Seeded initial user '{}'.", username);
    }
}
