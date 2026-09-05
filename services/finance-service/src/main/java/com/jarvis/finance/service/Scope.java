package com.jarvis.finance.service;

import com.jarvis.common.security.CallerContext;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * What the caller is allowed to see. An administrator (and a service-to-service call, which carries
 * no user token) sees the whole household; anyone else sees only the member they signed in as.
 */
@Component
public class Scope {

    /** Null when the caller sees everything, otherwise the single member they are confined to. */
    public Long memberId() {
        return CallerContext.restrictedTo();
    }

    public boolean all() {
        return memberId() == null;
    }

    /** Whether something belonging to {@code owner} is visible to the caller. */
    public boolean canSee(Long owner) {
        Long member = memberId();
        return member == null || member.equals(owner);
    }

    /** The member a listing should show: the one asked for, unless the caller is confined. */
    public Long resolve(Long requested) {
        Long member = memberId();
        return member != null ? member : requested;
    }

    /** Refuse a change that would reach outside the caller's own money. */
    public void requireOwn(Long owner) {
        if (!canSee(owner)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "That belongs to someone else.");
        }
    }

    /** Refuse anything only the household administrator should be doing. */
    public void requireAdmin() {
        if (!all()) {
            throw new ResponseStatusException(
                HttpStatus.FORBIDDEN, "Only the household administrator can change this.");
        }
    }
}
