package com.jarvis.common.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import javax.crypto.SecretKey;

/**
 * Issues and verifies HS256 JWTs. The shared secret (≥32 bytes) comes from config and must be
 * identical across every service so any service can validate a token the auth-service issued.
 */
public class JwtTokenService {

    private final SecretKey key;
    private final long ttlMinutes;

    public JwtTokenService(String secret, long ttlMinutes) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.ttlMinutes = ttlMinutes;
    }

    public String issue(String username, String roles) {
        Instant now = Instant.now();
        Instant exp = now.plus(ttlMinutes, ChronoUnit.MINUTES);
        return Jwts.builder()
            .subject(username)
            .claim("roles", roles)
            .issuedAt(Date.from(now))
            .expiration(Date.from(exp))
            .signWith(key)
            .compact();
    }

    /** Returns the parsed claims, or throws if the token is invalid/expired. */
    public Claims parse(String token) {
        return Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
    }

    public long getTtlMinutes() {
        return ttlMinutes;
    }
}
