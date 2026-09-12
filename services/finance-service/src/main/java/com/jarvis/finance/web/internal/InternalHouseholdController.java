package com.jarvis.finance.web.internal;

import com.jarvis.finance.domain.Goal;
import com.jarvis.finance.domain.Investment;
import com.jarvis.finance.domain.Loan;
import com.jarvis.finance.domain.Member;
import com.jarvis.finance.repo.GoalRepository;
import com.jarvis.finance.repo.InvestmentRepository;
import com.jarvis.finance.repo.LoanRepository;
import com.jarvis.finance.repo.MemberRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Who is in the household and what each of them owns, for the AI assistant. Internal-key guarded.
 *
 * <p>The assistant needs the roster before it can answer "how much did my wife spend": "wife" is a
 * relation, and only this service knows which member that is. Deciding who may be asked about is
 * not done here — the caller does that against the signed-in user, and this endpoint is reachable
 * only from inside the mesh.
 */
@RestController
@RequestMapping("/internal/household")
public class InternalHouseholdController {

    private final MemberRepository members;
    private final InvestmentRepository investments;
    private final LoanRepository loans;
    private final GoalRepository goals;
    private final String internalKey;

    public InternalHouseholdController(
        MemberRepository members,
        InvestmentRepository investments,
        LoanRepository loans,
        GoalRepository goals,
        @Value("${jarvis.internal.key}") String internalKey) {
        this.members = members;
        this.investments = investments;
        this.loans = loans;
        this.goals = goals;
        this.internalKey = internalKey;
    }

    /** Everyone tracked, so a name or a relation can be turned into a member id. */
    @GetMapping("/members")
    public List<MemberDto> members(
        @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        requireKey(key);
        return members.findAll().stream()
            .map(m -> new MemberDto(m.getId(), m.getName(), m.getRelation(), m.isEarns()))
            .toList();
    }

    /**
     * What one member owns and owes.
     *
     * @param memberId whose portfolio; null asks for the household's, everyone's rows together.
     */
    @GetMapping("/portfolio")
    public Portfolio portfolio(
        @RequestHeader(value = "X-Internal-Key", required = false) String key,
        @RequestParam(required = false) Long memberId) {
        requireKey(key);
        List<Investment> inv = memberId == null ? investments.findAll() : investments.findByMemberId(memberId);
        List<Loan> ln = memberId == null ? loans.findAll() : loans.findByMemberId(memberId);
        List<Goal> gl = memberId == null ? goals.findAll() : goals.findByMemberId(memberId);
        return new Portfolio(
            inv.stream()
                .map(i -> new InvestmentDto(
                    i.getName(), i.getKind(), i.getPrincipal(), i.getCurrent(), i.getSip(),
                    i.getRate(), i.getMaturityDate()))
                .toList(),
            ln.stream()
                .map(l -> new LoanDto(
                    l.getLender(), l.getKind(), l.getOutstanding(), l.getEmi(), l.getRate(),
                    l.getEndDate()))
                .toList(),
            gl.stream()
                .map(g -> new GoalDto(
                    g.getName(), g.getTargetAmount(), g.getSavedAmount(), g.getTargetDate()))
                .toList());
    }

    private void requireKey(String key) {
        if (!internalKey.equals(key)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bad internal key");
        }
    }

    /** @param earns false for someone with no income of their own — a homemaker or a child. */
    public record MemberDto(Long id, String name, String relation, boolean earns) {}

    public record Portfolio(List<InvestmentDto> investments, List<LoanDto> loans, List<GoalDto> goals) {}

    public record InvestmentDto(
        String name,
        String kind,
        BigDecimal invested,
        BigDecimal current,
        BigDecimal monthly,
        Double rate,
        LocalDate maturityDate) {}

    public record LoanDto(
        String lender,
        String kind,
        BigDecimal outstanding,
        BigDecimal emi,
        Double rate,
        LocalDate endDate) {}

    public record GoalDto(String name, BigDecimal target, BigDecimal saved, LocalDate targetDate) {}
}
