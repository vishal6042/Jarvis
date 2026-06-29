package com.jarvis.auth.web;

import com.jarvis.auth.domain.AppUser;
import com.jarvis.auth.repo.AppUserRepository;
import com.jarvis.auth.service.ProfileService;
import com.jarvis.auth.web.dto.ChangePasswordRequest;
import com.jarvis.auth.web.dto.LoginRequest;
import com.jarvis.auth.web.dto.LoginResponse;
import com.jarvis.auth.web.dto.RegisterRequest;
import com.jarvis.auth.web.dto.ResetPasswordRequest;
import com.jarvis.common.security.JwtTokenService;
import jakarta.validation.Valid;
import java.util.HashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AppUserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenService jwtTokenService;
    private final ProfileService profiles;

    public AuthController(
        AppUserRepository users,
        PasswordEncoder passwordEncoder,
        JwtTokenService jwtTokenService,
        ProfileService profiles) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.jwtTokenService = jwtTokenService;
        this.profiles = profiles;
    }

    /** Whether an account already exists — lets the UI show signup-first on a fresh install. */
    @GetMapping("/exists")
    public Map<String, Boolean> exists() {
        return Map.of("exists", users.count() > 0);
    }

    /** First-run signup: creates the single account + profile. The user then signs in. */
    @PostMapping("/register")
    public ResponseEntity<Map<String, String>> register(@Valid @RequestBody RegisterRequest req) {
        if (users.count() > 0) {
            throw new ResponseStatusException(
                HttpStatus.CONFLICT, "An account already exists — please sign in.");
        }
        if (users.existsByUsername(req.username())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Username already taken.");
        }
        AppUser user = new AppUser();
        user.setUsername(req.username().trim());
        user.setPasswordHash(passwordEncoder.encode(req.password()));
        user.setRoles("USER");
        user.setSecurityQuestion(req.securityQuestion().trim());
        user.setSecurityAnswerHash(passwordEncoder.encode(normalizeAnswer(req.securityAnswer())));
        user = users.save(user);
        profiles.createForUser(
            user, req.fullName(), req.email(), req.phone(), req.baseCurrency(), req.city());
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("username", user.getUsername()));
    }

    /** The security question to show on the "forgot password" screen (single user). */
    @GetMapping("/security-question")
    public Map<String, String> securityQuestion() {
        Map<String, String> body = new HashMap<>();
        body.put("question",
            users.findFirstByOrderByIdAsc().map(AppUser::getSecurityQuestion).orElse(null));
        return body;
    }

    /** Recover access: verify the security answer, then set a new password. */
    @PostMapping("/reset-password")
    public Map<String, String> resetPassword(@Valid @RequestBody ResetPasswordRequest req) {
        AppUser user = users.findFirstByOrderByIdAsc()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No account"));
        if (user.getSecurityAnswerHash() == null
            || !passwordEncoder.matches(normalizeAnswer(req.answer()), user.getSecurityAnswerHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Incorrect answer");
        }
        user.setPasswordHash(passwordEncoder.encode(req.newPassword()));
        users.save(user);
        return Map.of("username", user.getUsername());
    }

    /** Change the password while signed-in (current password required). */
    @PostMapping("/change-password")
    public Map<String, String> changePassword(@Valid @RequestBody ChangePasswordRequest req) {
        AppUser user = users.findFirstByOrderByIdAsc()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No account"));
        if (!passwordEncoder.matches(req.currentPassword(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Current password is incorrect");
        }
        user.setPasswordHash(passwordEncoder.encode(req.newPassword()));
        users.save(user);
        return Map.of("username", user.getUsername());
    }

    /** Normalise the security answer so casing/spacing don't matter. */
    private String normalizeAnswer(String answer) {
        return answer == null ? "" : answer.trim().toLowerCase();
    }

    @PostMapping("/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest req) {
        AppUser user = users
            .findByUsername(req.username())
            .filter(u -> passwordEncoder.matches(req.password(), u.getPasswordHash()))
            .orElseThrow(
                () -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials"));

        String token = jwtTokenService.issue(user.getUsername(), user.getRoles());
        return new LoginResponse(
            token, "Bearer", jwtTokenService.getTtlMinutes(), user.getUsername());
    }
}
