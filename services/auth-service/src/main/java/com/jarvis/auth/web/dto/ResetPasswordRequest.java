package com.jarvis.auth.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Recover access by answering the security question and choosing a new password. The username is
 * optional so a single-user install can keep asking without one; with more than one account it
 * says whose password is being reset.
 */
public record ResetPasswordRequest(
    String username,
    @NotBlank String answer,
    @NotBlank @Size(min = 4, max = 100) String newPassword) {}
