package com.jarvis.auth.web;

import com.jarvis.auth.domain.AppUser;
import com.jarvis.auth.repo.AppUserRepository;
import com.jarvis.auth.service.ProfileService;
import com.jarvis.auth.web.dto.ChangePasswordRequest;
import com.jarvis.auth.web.dto.LoginRequest;
import com.jarvis.auth.web.dto.LoginResponse;
import com.jarvis.auth.web.dto.RegisterRequest;
import com.jarvis.auth.web.dto.ResetPasswordRequest;
import com.jarvis.common.security.Caller;
import com.jarvis.common.security.CallerContext;
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

    /**
     * The security question to show on the "forgot password" screen. Without a username this
     * answers for the household administrator, which is what the single-user install expects.
     */
    @GetMapping("/security-question")
    public Map<String, String> securityQuestion(@RequestParam(required = false) String username) {
        Map<String, String> body = new HashMap<>();
        body.put("question", forRecovery(username).map(AppUser::getSecurityQuestion).orElse(null));
        return body;
    }

    /** The account a "forgot password" flow is about: the one named, else the first one created. */
    private java.util.Optional<AppUser> forRecovery(String username) {
        return username == null || username.isBlank()
            ? users.findFirstByOrderByIdAsc()
            : users.findByUsername(username.trim());
    }

    /** Recover access: verify the security answer, then set a new password. */
    @PostMapping("/reset-password")
    public Map<String, String> resetPassword(@Valid @RequestBody ResetPasswordRequest req) {
        AppUser user = forRecovery(req.username())
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
        // Whoever is signed in — not simply the first account, which once there is more than one
        // user would let one person change another persons password.
        String me = CallerContext.current().map(Caller::username)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sign in first"));
        AppUser user = users.findByUsername(me)
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

    /** Who is signed in, and what they are allowed to see — read by both the web app and phone. */
    @GetMapping("/me")
    public Map<String, Object> me() {
        Caller caller = CallerContext.current()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sign in first"));
        Map<String, Object> body = new HashMap<>();
        body.put("username", caller.username());
        body.put("admin", caller.admin());
        body.put("memberId", caller.memberId());
        return body;
    }

    @PostMapping("/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest req) {
        AppUser user = users
            .findByUsername(req.username())
            .filter(u -> passwordEncoder.matches(req.password(), u.getPasswordHash()))
            .orElseThrow(
                () -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials"));

        String token = jwtTokenService.issue(user.getUsername(), user.getRoles(), user.getMemberId());
        return new LoginResponse(
            token, "Bearer", jwtTokenService.getTtlMinutes(), user.getUsername(),
            user.isAdmin(), user.getMemberId());
    }
}
