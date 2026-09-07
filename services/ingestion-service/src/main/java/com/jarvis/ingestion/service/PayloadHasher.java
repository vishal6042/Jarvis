package com.jarvis.ingestion.service;

import com.jarvis.ingestion.domain.MessageSource;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.ZoneOffset;
import org.springframework.stereotype.Component;

/**
 * Stable key for "this is the same alert we have already seen". Hashes what the phone actually
 * sent -- source, sender, the raw text, and the day it arrived -- and nothing the parser produced.
 *
 * <p>That distinction is the point. expense-service dedups on the parsed result (merchant, amount,
 * date), which comes out of a language model and can differ between two runs over identical text.
 * This key cannot: the same alert forwarded twice always hashes the same, so the repeat is caught
 * before the parser is ever called.
 *
 * <p>The day is included so an identical alert on a later day is still treated as a new event.
 * Kept in step with the backfill in {@code V3__raw_message_payload_hash.sql} -- change one and the
 * other has to change with it.
 */
@Component
public class PayloadHasher {

    public String hash(MessageSource source, String sender, String payload, Instant receivedAt) {
        String key = String.join(
            "|",
            source == null ? "" : source.name(),
            sender == null ? "" : sender,
            payload == null ? "" : payload,
            receivedAt.atZone(ZoneOffset.UTC).toLocalDate().toString());
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
