package com.jarvis.auth.web.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** First-run signup: account credentials + the personal details that become the user's profile. */
public record RegisterRequest(
    @NotBlank @Size(min = 3, max = 100) String username,
    @NotBlank @Size(min = 4, max = 100) String password,
    @NotBlank String securityQuestion,
    @NotBlank String securityAnswer,
    String fullName,
    @Email String email,
    String phone,
    String baseCurrency,
    String city) {}
