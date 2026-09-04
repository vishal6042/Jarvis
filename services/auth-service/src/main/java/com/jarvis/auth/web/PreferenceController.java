package com.jarvis.auth.web;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jarvis.auth.domain.UserPreference;
import com.jarvis.auth.repo.AppUserRepository;
import com.jarvis.auth.repo.UserPreferenceRepository;
import java.security.Principal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Per-user app preferences as JSON values under short keys (reserve, rewards, dashboard
 * toggles). Kept server-side so settings follow the user across browsers and devices.
 */
@RestController
@RequestMapping("/api/preferences")
public class PreferenceController {

    private final UserPreferenceRepository prefs;
    private final AppUserRepository users;
    private final ObjectMapper json;

    public PreferenceController(UserPreferenceRepository prefs, AppUserRepository users, ObjectMapper json) {
        this.prefs = prefs;
        this.users = users;
        this.json = json;
    }

    /** All of the caller's preferences: {key: value}. */
    @GetMapping
    @Transactional(readOnly = true)
    public Map<String, JsonNode> all(Principal principal) {
        Map<String, JsonNode> out = new LinkedHashMap<>();
        for (UserPreference p : prefs.findByAppUser_Username(principal.getName())) {
            out.put(p.getPrefKey(), parse(p.getValueJson()));
        }
        return out;
    }

    /** Upsert one preference; the body is the JSON value itself (number, string, object …). */
    @PutMapping("/{key}")
    @Transactional
    public JsonNode put(Principal principal, @PathVariable String key, @RequestBody JsonNode value) {
        if (key.isBlank() || key.length() > 80) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bad preference key");
        }
        UserPreference p = prefs.findByAppUser_UsernameAndPrefKey(principal.getName(), key).orElseGet(() -> {
            UserPreference n = new UserPreference();
            n.setAppUser(users.findByUsername(principal.getName())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user")));
            n.setPrefKey(key);
            return n;
        });
        p.setValueJson(value.toString());
        p.setUpdatedAt(Instant.now());
        prefs.save(p);
        return value;
    }

    @DeleteMapping("/{key}")
    @Transactional
    public ResponseEntity<Void> delete(Principal principal, @PathVariable String key) {
        prefs.findByAppUser_UsernameAndPrefKey(principal.getName(), key).ifPresent(prefs::delete);
        return ResponseEntity.noContent().build();
    }

    private JsonNode parse(String text) {
        try {
            return json.readTree(text);
        } catch (JsonProcessingException e) {
            return json.nullNode();
        }
    }
}
