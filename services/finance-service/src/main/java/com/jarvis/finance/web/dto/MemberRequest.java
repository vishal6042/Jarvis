package com.jarvis.finance.web.dto;

import jakarta.validation.constraints.NotBlank;

public record MemberRequest(@NotBlank String name, String relation, String email) {}
