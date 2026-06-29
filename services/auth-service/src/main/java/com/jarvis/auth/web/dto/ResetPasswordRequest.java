package com.jarvis.auth.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Recover access by answering the security question and choosing a new password. */
public record ResetPasswordRequest(
    @NotBlank String answer,
    @NotBlank @Size(min = 4, max = 100) String newPassword) {}
