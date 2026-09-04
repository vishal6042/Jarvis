package com.jarvis.finance.config;

import com.jarvis.finance.domain.Member;
import com.jarvis.finance.repo.MemberRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

/**
 * Ensures the single primary "Self" member exists so the app has an active member to attach
 * investments/loans to. Deliberately seeds NO sample finance data — the app shows only what the
 * user actually enters or imports.
 */
@Component
public class FinanceSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(FinanceSeeder.class);

    private final MemberRepository members;

    public FinanceSeeder(MemberRepository members) {
        this.members = members;
    }

    @Override
    public void run(String... args) {
        if (members.count() > 0) return;

        Member self = new Member();
        self.setName("You");
        self.setRelation("Self");
        members.save(self);
        log.info("Created primary 'Self' member (no sample data seeded).");
    }
}
