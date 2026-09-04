package com.jarvis.auth.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** One app preference for one user: a JSON value under a short dotted key (e.g. "reserve", "rewards"). */
@Entity
@Table(name = "user_preference", uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "pref_key"}))
@Getter
@Setter
@NoArgsConstructor
public class UserPreference {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private AppUser appUser;

    @Column(name = "pref_key", nullable = false, length = 80)
    private String prefKey;

    @Column(name = "value_json", nullable = false, columnDefinition = "text")
    private String valueJson;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();
}
