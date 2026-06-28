package com.jarvis.auth.web.dto;

import jakarta.validation.constraints.Email;

public record UpdateProfileRequest(
    String fullName, @Email String email, String phone, String baseCurrency, String city) {}
