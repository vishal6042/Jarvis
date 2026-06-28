package com.jarvis.finance.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** A family member whose finances are tracked. The "Self" member is the primary user. */
@Entity
@Table(name = "member")
@Getter
@Setter
@NoArgsConstructor
public class Member {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    /** Self, Spouse, Child, Parent, … */
    @Column(name = "relation", nullable = false)
    private String relation = "Self";

    private String email;
}
