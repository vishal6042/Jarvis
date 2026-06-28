package com.jarvis.finance.config;

import com.jarvis.finance.domain.CategoryThreshold;
import com.jarvis.finance.domain.Investment;
import com.jarvis.finance.domain.Loan;
import com.jarvis.finance.domain.Member;
import com.jarvis.finance.domain.Reminder;
import com.jarvis.finance.repo.CategoryThresholdRepository;
import com.jarvis.finance.repo.InvestmentRepository;
import com.jarvis.finance.repo.LoanRepository;
import com.jarvis.finance.repo.MemberRepository;
import com.jarvis.finance.repo.ReminderRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

/** Seeds a primary "Self" member + starter data on an empty DB (mirrors the FE's old sample data). */
@Component
public class FinanceSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(FinanceSeeder.class);

    private final MemberRepository members;
    private final InvestmentRepository investments;
    private final LoanRepository loans;
    private final ReminderRepository reminders;
    private final CategoryThresholdRepository thresholds;

    public FinanceSeeder(
        MemberRepository members,
        InvestmentRepository investments,
        LoanRepository loans,
        ReminderRepository reminders,
        CategoryThresholdRepository thresholds) {
        this.members = members;
        this.investments = investments;
        this.loans = loans;
        this.reminders = reminders;
        this.thresholds = thresholds;
    }

    @Override
    public void run(String... args) {
        if (members.count() > 0) return;

        Member self = new Member();
        self.setName("You");
        self.setRelation("Self");
        self = members.save(self);
        Long m = self.getId();

        inv(m, "FD", "HDFC Bank", 200000, 214000, 7.1, null, "2024-03-15", "2027-03-15");
        inv(m, "RD", "ICICI Bank", 60000, 63200, 6.8, 5000, "2025-01-01", "2026-12-01");
        inv(m, "PPF", "SBI", 450000, 512000, 7.1, null, "2016-04-01", "2031-04-01");
        inv(m, "PF", "EPFO", 380000, 421000, 8.25, null, "2018-07-01", null);
        inv(m, "NSC", "Post Office", 100000, 108000, 7.7, null, "2024-06-10", "2029-06-10");
        inv(m, "SSY", "Post Office", 150000, 168000, 8.2, null, "2023-01-20", "2038-01-20");
        inv(m, "MF", "Parag Parikh Flexi Cap", 120000, 158400, null, 10000, "2022-05-01", null);
        inv(m, "MF", "UTI Nifty 50 Index", 90000, 104200, null, 5000, "2023-02-01", null);

        loan(m, "HOME", "HDFC Ltd", 5000000, 3820000, 42000, 8.6, 240, "2021-06-01", "2041-06-01");
        loan(m, "CAR", "ICICI Bank", 900000, 412000, 16500, 9.2, 60, "2023-03-01", "2028-03-01");

        reminder("House rent", 2, "RENT", 35000, "monthly");
        reminder("Home loan EMI", 5, "EMI", 42000, "monthly");
        reminder("Electricity bill", 7, "BILL", 2400, "none");
        reminder("Flexi Cap SIP", 9, "SIP", 10000, "monthly");
        reminder("Credit card bill", 12, "BILL", 18600, "monthly");

        threshold("Food", 12000);
        threshold("Shopping", 15000);
        threshold("Bills & Utilities", 10000);
        threshold("Transport", 6000);
        threshold("Entertainment", 5000);
        threshold("Health", 5000);
        threshold("Miscellaneous", 6000);

        log.info("Seeded finance starter data for member '{}'.", self.getName());
    }

    private void inv(Long m, String kind, String name, double principal, double current,
                     Double rate, Integer sip, String opening, String maturity) {
        Investment i = new Investment();
        i.setMemberId(m);
        i.setKind(kind);
        i.setName(name);
        i.setPrincipal(BigDecimal.valueOf(principal));
        i.setCurrent(BigDecimal.valueOf(current));
        i.setRate(rate);
        i.setSip(sip == null ? null : BigDecimal.valueOf(sip));
        if (opening != null) {
            i.setOpeningDate(LocalDate.parse(opening));
            i.setCommencementDate(LocalDate.parse(opening));
        }
        if (maturity != null) i.setMaturityDate(LocalDate.parse(maturity));
        investments.save(i);
    }

    private void loan(Long m, String kind, String lender, double sanctioned, double outstanding,
                      double emi, double rate, int tenure, String start, String end) {
        Loan l = new Loan();
        l.setMemberId(m);
        l.setKind(kind);
        l.setLender(lender);
        l.setSanctioned(BigDecimal.valueOf(sanctioned));
        l.setOutstanding(BigDecimal.valueOf(outstanding));
        l.setEmi(BigDecimal.valueOf(emi));
        l.setRate(rate);
        l.setTenureMonths(tenure);
        l.setStartDate(LocalDate.parse(start));
        l.setEndDate(LocalDate.parse(end));
        loans.save(l);
    }

    private void reminder(String title, int daysAhead, String type, double amount, String repeat) {
        Reminder r = new Reminder();
        r.setTitle(title);
        r.setDate(LocalDate.now().plusDays(daysAhead));
        r.setType(type);
        r.setAmount(BigDecimal.valueOf(amount));
        r.setRepeat(repeat);
        reminders.save(r);
    }

    private void threshold(String category, double amount) {
        thresholds.save(new CategoryThreshold(category, BigDecimal.valueOf(amount)));
    }
}
