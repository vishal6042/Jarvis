package com.jarvis.finance.repo;

import com.jarvis.finance.domain.Member;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MemberRepository extends JpaRepository<Member, Long> {
}
