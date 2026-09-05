package com.jarvis.auth.web.dto;

import jakarta.validation.constraints.Size;

/** Changing an account: any field left null is left alone. */
public record UpdateUserRequest(
    @Size(min = 4, max = 100) String password, Long memberId, Boolean admin) {}
