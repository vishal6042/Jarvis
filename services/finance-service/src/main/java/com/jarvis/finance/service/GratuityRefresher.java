package com.jarvis.finance.service;

import com.jarvis.finance.domain.GratuityMath;
import com.jarvis.finance.domain.Investment;
import com.jarvis.finance.repo.InvestmentRepository;
import java.time.LocalDate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/**
 * Gratuity grows by a year's worth on each service anniversary (and six months after it), not by
 * deposits, so nothing else would ever move the stored value. Re-work it out at start-up and each
 * night, so the web, phone and assistant all read a current figure.
 */
@Configuration
@EnableScheduling
public class GratuityRefresher {

    private static final Logger log = LoggerFactory.getLogger(GratuityRefresher.class);

    private final InvestmentRepository investments;

    public GratuityRefresher(InvestmentRepository investments) {
        this.investments = investments;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onStart() {
        refreshAll();
    }

    @Scheduled(cron = "0 10 0 * * *")
    public void refreshAll() {
        LocalDate today = LocalDate.now();
        for (Investment i : investments.findAll()) {
            if (GratuityMath.refresh(i, today)) {
                investments.save(i);
                log.info("Gratuity {} recalculated: ₹{}", i.getName(), i.getCurrent().toPlainString());
            }
        }
    }
}
