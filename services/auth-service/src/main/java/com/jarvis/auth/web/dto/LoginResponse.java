package com.jarvis.auth.web.dto;

public record LoginResponse(String token, String tokenType, long expiresInMinutes, String username) {}
