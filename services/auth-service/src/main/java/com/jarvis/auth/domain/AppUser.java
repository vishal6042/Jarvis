package com.jarvis.auth.domain;

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

    /**
     * The household member this account speaks for, as known to finance-service. An admin sees the
     * whole household regardless; for everyone else this is the only money they can see.
     */
    @Column(name = "member_id")
    private Long memberId;

    /** Whether this account has authority over the household: read everything, manage users. */
    public boolean isAdmin() {
        return roles != null && roles.contains("ADMIN");
    }

    /** Self-serve recovery: a security question + the BCrypt hash of its (normalised) answer. */
    @Column(name = "security_question")
    private String securityQuestion;

    @Column(name = "security_answer_hash", length = 100)
    private String securityAnswerHash;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();
}
