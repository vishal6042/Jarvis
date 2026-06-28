package com.jarvis.auth.web.dto;

import com.jarvis.auth.domain.UserProfile;

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
