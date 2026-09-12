package com.jarvis.ai.agent;

import com.jarvis.ai.client.FinanceClient;
import com.jarvis.common.security.CallerContext;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.stereotype.Component;

/**
 * Who the household is, and what each of them owns and owes.
 *
 * <p>The spending tools answer "how much"; these answer "whose". Between them the assistant can
 * take "how much did my wife spend this month" or "what has she got invested" at face value
 * instead of asking the user to go and look.
 */
@Component
public class HouseholdTools {

    private final FinanceClient finance;
    private final People people;

    public HouseholdTools(FinanceClient finance, People people) {
        this.finance = finance;
        this.people = people;
    }

    @Tool(description = """
        The people in this household — their name, how they are related, and whether they have an
        income of their own. Call this when the user names someone you do not recognise, or asks
        who is tracked.""")
    public String householdMembers() {
        List<FinanceClient.Member> roster;
        try {
            roster = finance.members();
        } catch (Exception e) {
            return "The household list is unavailable right now.";
        }
        if (roster == null || roster.isEmpty()) {
            return "No household members are set up yet.";
        }
        Long confinedTo = CallerContext.restrictedTo();
        // Someone confined to their own money is not shown the rest of the household's names.
        List<FinanceClient.Member> visible = confinedTo == null
            ? roster
            : roster.stream().filter(m -> confinedTo.equals(m.id())).toList();
        return visible.stream()
            .map(m -> m.label() + (m.earns() ? "" : ", no income of their own"))
            .collect(Collectors.joining("; "));
    }

    @Tool(description = """
        What one person owns and owes: investments with what they are worth now, loans with what is
        outstanding and the EMI, and savings goals. Use this for questions about a portfolio, an
        investment, a loan or a goal — the user's own or another household member's.""")
    public String portfolio(
        @ToolParam(
            description = "whose portfolio, ONLY when the user singles someone out: a name, a "
                + "relation like wife, or 'me'. Leave blank for the whole household together",
            required = false)
        String person) {
        People.Choice who = people.resolve(person);
        if (who.refused()) {
            return who.refusal();
        }
        FinanceClient.Portfolio p;
        try {
            p = finance.portfolio(who.memberId());
        } catch (Exception e) {
            return "The portfolio is unavailable right now.";
        }
        if (p == null) {
            return "Nothing recorded for " + who.label() + ".";
        }

        List<String> parts = new ArrayList<>();
        if (p.investments() != null && !p.investments().isEmpty()) {
            BigDecimal current = p.investments().stream()
                .map(FinanceClient.Investment::current)
                .filter(v -> v != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal invested = p.investments().stream()
                .map(FinanceClient.Investment::invested)
                .filter(v -> v != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
            ChatVisuals.add(Visual.spend(
                Visual.BREAKDOWN, "Investments", who.label(), current,
                "%s put in, worth %s now".formatted(Money.rupees(invested), Money.rupees(current)),
                p.investments().stream()
                    .map(i -> Visual.Point.of(
                        i.name(), i.current(),
                        i.kind() + (i.maturityDate() == null ? "" : " · matures " + i.maturityDate())))
                    .toList()));
            parts.add("Investments worth INR %s: %s".formatted(
                Money.inr(current),
                p.investments().stream()
                    .map(i -> "%s (%s) INR %s%s%s".formatted(
                        i.name(), i.kind(), Money.inr(i.current()),
                        i.monthly() == null || i.monthly().signum() == 0
                            ? "" : ", INR " + Money.inr(i.monthly()) + "/month",
                        i.maturityDate() == null ? "" : ", matures " + i.maturityDate()))
                    .collect(Collectors.joining("; "))));
        }
        if (p.loans() != null && !p.loans().isEmpty()) {
            BigDecimal outstanding = p.loans().stream()
                .map(FinanceClient.Loan::outstanding)
                .filter(v -> v != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal emi = p.loans().stream()
                .map(FinanceClient.Loan::emi)
                .filter(v -> v != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
            ChatVisuals.add(Visual.spend(
                Visual.BREAKDOWN, "Loans outstanding", who.label(), outstanding,
                "%s a month in EMI".formatted(Money.rupees(emi)),
                p.loans().stream()
                    .map(l -> Visual.Point.of(
                        l.lender(), l.outstanding(),
                        "%s · EMI %s%s".formatted(
                            l.kind(), Money.rupees(l.emi()), l.rate() == null ? "" : " at " + l.rate() + "%")))
                    .toList()));
            parts.add("Loans outstanding INR %s: %s".formatted(
                Money.inr(outstanding),
                p.loans().stream()
                    .map(l -> "%s (%s) INR %s left, EMI INR %s%s".formatted(
                        l.lender(), l.kind(), Money.inr(l.outstanding()), Money.inr(l.emi()),
                        l.rate() == null ? "" : " at " + l.rate() + "%"))
                    .collect(Collectors.joining("; "))));
        }
        if (p.goals() != null && !p.goals().isEmpty()) {
            ChatVisuals.add(Visual.spend(
                // No caption: the goals themselves are right underneath, and counting them adds nothing.
                Visual.PROGRESS, "Goals", who.label(), null, null,
                p.goals().stream()
                    .map(g -> new Visual.Point(
                        g.name(), g.saved(), g.target(),
                        g.targetDate() == null ? null : "by " + g.targetDate()))
                    .toList()));
            parts.add("Goals: " + p.goals().stream()
                .map(g -> "%s INR %s of INR %s%s".formatted(
                    g.name(), Money.inr(g.saved()), Money.inr(g.target()),
                    g.targetDate() == null ? "" : " by " + g.targetDate()))
                .collect(Collectors.joining("; ")));
        }
        if (parts.isEmpty()) {
            return "No investments, loans or goals recorded for " + who.label() + ".";
        }
        return who.label() + " — " + String.join(". ", parts);
    }
}
