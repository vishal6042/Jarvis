package com.jarvis.backend.web.dto;

public record LoginResponse(String token, String tokenType, long expiresInMinutes, String username) {}
