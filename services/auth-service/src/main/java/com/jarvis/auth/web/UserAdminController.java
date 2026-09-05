package com.jarvis.auth.web;

import com.jarvis.auth.domain.AppUser;
import com.jarvis.auth.repo.AppUserRepository;
import com.jarvis.auth.web.dto.CreateUserRequest;
import com.jarvis.auth.web.dto.UpdateUserRequest;
import com.jarvis.auth.web.dto.UserDto;
import com.jarvis.common.security.Caller;
import com.jarvis.common.security.CallerContext;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * Household account management, for the administrator only. It lives outside {@code /api/auth/**}
 * on purpose: that prefix is public at the gateway so a signed-out person can log in, and these
 * endpoints must never be.
 */
@RestController
@RequestMapping("/api/users")
public class UserAdminController {

    private final AppUserRepository users;
    private final PasswordEncoder passwordEncoder;

    public UserAdminController(AppUserRepository users, PasswordEncoder passwordEncoder) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
    }

    @GetMapping
    public List<UserDto> list() {
        requireAdmin();
        return users.findAll().stream()
            .sorted((a, b) -> Long.compare(a.getId(), b.getId()))
            .map(UserDto::of)
            .toList();
    }

    @PostMapping
    public ResponseEntity<UserDto> create(@Valid @RequestBody CreateUserRequest req) {
        requireAdmin();
        if (users.existsByUsername(req.username().trim())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Username already taken.");
        }
        AppUser user = new AppUser();
        user.setUsername(req.username().trim());
        user.setPasswordHash(passwordEncoder.encode(req.password()));
        user.setRoles(req.admin() ? "USER,ADMIN" : "USER");
        user.setMemberId(req.memberId());
        if (req.securityQuestion() != null && !req.securityQuestion().isBlank()
            && req.securityAnswer() != null && !req.securityAnswer().isBlank()) {
            user.setSecurityQuestion(req.securityQuestion().trim());
            user.setSecurityAnswerHash(
                passwordEncoder.encode(req.securityAnswer().trim().toLowerCase()));
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(UserDto.of(users.save(user)));
    }

    @PatchMapping("/{id}")
    public UserDto update(@PathVariable Long id, @Valid @RequestBody UpdateUserRequest req) {
        requireAdmin();
        AppUser user = users.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such user"));
        if (req.password() != null && !req.password().isBlank()) {
            user.setPasswordHash(passwordEncoder.encode(req.password()));
        }
        if (req.memberId() != null) {
            user.setMemberId(req.memberId());
        }
        if (req.admin() != null) {
            if (!req.admin() && user.isAdmin() && lastAdmin(user)) {
                throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "This is the only administrator — promote someone first.");
            }
            user.setRoles(req.admin() ? "USER,ADMIN" : "USER");
        }
        return UserDto.of(users.save(user));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        Caller me = requireAdmin();
        AppUser user = users.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such user"));
        if (user.getUsername().equals(me.username())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "You cannot delete your own account.");
        }
        if (user.isAdmin() && lastAdmin(user)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The last administrator must stay.");
        }
        users.delete(user);
        return ResponseEntity.noContent().build();
    }

    /** True when removing this user's authority would leave the household with no administrator. */
    private boolean lastAdmin(AppUser user) {
        return users.findAll().stream()
            .noneMatch(u -> u.isAdmin() && !u.getId().equals(user.getId()));
    }

    private Caller requireAdmin() {
        Caller caller = CallerContext.current()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sign in first"));
        if (!caller.admin()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Administrators only.");
        }
        return caller;
    }
}
