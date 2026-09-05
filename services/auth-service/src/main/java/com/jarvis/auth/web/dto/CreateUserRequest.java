package com.jarvis.auth.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * An administrator adding someone to the household. {@code memberId} is required: the whole point
 * of the account is that it sees one person's money, so it must say whose.
 */
public record CreateUserRequest(
    @NotBlank @Size(min = 3, max = 100) String username,
    @NotBlank @Size(min = 4, max = 100) String password,
    @NotNull Long memberId,
    boolean admin,
    String securityQuestion,
    String securityAnswer) {}
