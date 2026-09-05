package com.jarvis.common.security;

/**
 * Who is asking, as carried by the JWT. {@code memberId} is the household member this sign-in
 * belongs to; an admin has authority over the whole household and is never restricted to one
 * member, whatever their own member id says.
 */
public record Caller(String username, Long memberId, boolean admin) {

    /** True when this caller may only see one member's money. */
    public boolean restricted() {
        return !admin && memberId != null;
    }
}
