package com.jarvis.auth.web.dto;

import com.jarvis.auth.domain.AppUser;
import java.time.Instant;

/** An account as the administrator sees it. Never carries a password or an answer hash. */
public record UserDto(
    Long id, String username, boolean admin, Long memberId, boolean canRecover, Instant createdAt) {

    public static UserDto of(AppUser u) {
        return new UserDto(
            u.getId(),
            u.getUsername(),
            u.isAdmin(),
            u.getMemberId(),
            u.getSecurityAnswerHash() != null,
            u.getCreatedAt());
    }
}
