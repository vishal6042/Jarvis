package com.jarvis.backend.domain;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** The user's personal profile (1:1 with {@link AppUser}). */
@Entity
@Table(name = "user_profile", uniqueConstraints = @UniqueConstraint(columnNames = "user_id"))
@Getter
@Setter
@NoArgsConstructor
public class UserProfile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private AppUser appUser;

    @Column(name = "full_name")
    private String fullName;

    private String email;

    private String phone;

    @Column(name = "base_currency", length = 3)
    private String baseCurrency = "INR";

    private String city;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();
}
