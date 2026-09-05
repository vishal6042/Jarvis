package com.jarvis.common.security;

import java.util.Optional;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * Reads the current {@link Caller} out of the Spring Security context. Service-to-service calls on
 * {@code /internal/**} carry no user token, so there is no caller and nothing is restricted — those
 * paths are already gated by the internal key.
 */
public final class CallerContext {

    private CallerContext() {}

    public static Optional<Caller> current() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null && auth.getDetails() instanceof Caller c ? Optional.of(c) : Optional.empty();
    }

    /** The member the caller is confined to, or null when they may see the whole household. */
    public static Long restrictedTo() {
        return current().filter(Caller::restricted).map(Caller::memberId).orElse(null);
    }

    /** False when nobody is signed in, so an unauthenticated path can never pass as an admin. */
    public static boolean isAdmin() {
        return current().map(Caller::admin).orElse(false);
    }
}
