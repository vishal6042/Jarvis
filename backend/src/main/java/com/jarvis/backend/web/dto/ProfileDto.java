package com.jarvis.backend.web.dto;

import com.jarvis.backend.domain.UserProfile;

public record ProfileDto(
    String username, String fullName, String email, String phone, String baseCurrency, String city) {

    public static ProfileDto from(UserProfile p) {
        return new ProfileDto(
            p.getAppUser().getUsername(),
            p.getFullName(),
            p.getEmail(),
            p.getPhone(),
            p.getBaseCurrency(),
            p.getCity());
    }
}
