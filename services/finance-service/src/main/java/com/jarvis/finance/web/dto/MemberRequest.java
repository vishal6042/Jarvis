package com.jarvis.finance.web.dto;

import jakarta.validation.constraints.NotBlank;

/** @param earns null keeps the member's current setting (and defaults a new member to earning). */
public record MemberRequest(@NotBlank String name, String relation, String email, Boolean earns) {}
