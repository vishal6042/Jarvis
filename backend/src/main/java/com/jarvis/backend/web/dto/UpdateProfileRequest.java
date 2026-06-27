package com.jarvis.backend.web.dto;

import jakarta.validation.constraints.Email;

public record UpdateProfileRequest(
    String fullName, @Email String email, String phone, String baseCurrency, String city) {}
