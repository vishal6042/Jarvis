package com.jarvis.backend.web;

import com.jarvis.backend.service.ProfileService;
import com.jarvis.backend.web.dto.ProfileDto;
import com.jarvis.backend.web.dto.UpdateProfileRequest;
import jakarta.validation.Valid;
import java.security.Principal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/profile")
public class ProfileController {

    private final ProfileService service;

    public ProfileController(ProfileService service) {
        this.service = service;
    }

    @GetMapping
    public ProfileDto get(Principal principal) {
        return service.getOrCreate(principal.getName());
    }

    @PutMapping
    public ProfileDto update(Principal principal, @Valid @RequestBody UpdateProfileRequest req) {
        return service.update(principal.getName(), req);
    }
}
