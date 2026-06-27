package com.jarvis.backend.web;

import com.jarvis.backend.domain.AppUser;
import com.jarvis.backend.repo.AppUserRepository;
import com.jarvis.backend.security.JwtService;
import com.jarvis.backend.web.dto.LoginRequest;
import com.jarvis.backend.web.dto.LoginResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AppUserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthController(
        AppUserRepository users, PasswordEncoder passwordEncoder, JwtService jwtService) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    @PostMapping("/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest req) {
        AppUser user = users
            .findByUsername(req.username())
            .filter(u -> passwordEncoder.matches(req.password(), u.getPasswordHash()))
            .orElseThrow(
                () -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials"));

        String token = jwtService.issue(user.getUsername(), user.getRoles());
        return new LoginResponse(
            token, "Bearer", jwtService.getTtlMinutes(), user.getUsername());
    }
}
