package com.jarvis.expense.service;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.ZoneOffset;
import org.springframework.stereotype.Component;

/**
 * Stable hash for de-duplicating the same transaction arriving via multiple channels
 * (e.g. an SMS and an email for one purchase). Keyed on account last-4, amount, calendar
 * day, and merchant — deliberately coarse on time since SMS/email timestamps differ slightly.
 */
@Component
public class DedupHasher {

    public String hash(String last4, BigDecimal amount, Instant occurredAt, String merchant) {
        String day = occurredAt.atZone(ZoneOffset.UTC).toLocalDate().toString();
        String key = String.join(
            "|",
            last4 == null ? "?" : last4,
            amount == null ? "?" : amount.stripTrailingZeros().toPlainString(),
            day,
            merchant == null ? "?" : merchant.trim().toLowerCase());
        return sha256(key);
    }

    private String sha256(String input) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                sb.append(Character.forDigit((b >> 4) & 0xF, 16));
                sb.append(Character.forDigit(b & 0xF, 16));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
