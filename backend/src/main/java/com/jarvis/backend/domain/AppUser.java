package com.jarvis.backend.domain;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Application user. Single user seeded for the MVP; the table supports more. */
@Entity
@Table(name = "app_user", uniqueConstraints = @UniqueConstraint(columnNames = "username"))
@Getter
@Setter
@NoArgsConstructor
public class AppUser {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String username;

    @Column(name = "password_hash", nullable = false, length = 100)
    private String passwordHash;

    /** Comma-separated roles, e.g. "USER" or "USER,ADMIN". */
    @Column(nullable = false)
    private String roles = "USER";

    @Column(nullable = false)
    private Instant createdAt = Instant.now();
}
