package com.jarvis.ai.agent;

import com.jarvis.ai.client.FinanceClient;
import com.jarvis.common.security.CallerContext;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Turns the word a person used — "my wife", "Neha", "me", "everyone" — into the member whose money
 * the tools should read, or into a refusal.
 *
 * <p>Naming nobody means the whole household: the administrator's default question is about the
 * family's money, and it is split by person only when they ask for that.
 *
 * <p>Two rules matter more than the matching. Nothing here can widen what the person asking may
 * see: someone confined to their own money is answered about themselves or not at all, whatever
 * name they type. And an unrecognised name is refused rather than guessed at — quietly reporting
 * the wrong person's spending is worse than saying who is on the list.
 */
@Component
public class People {

    private static final Logger log = LoggerFactory.getLogger(People.class);

    /** How a combined figure is described, so an answer never passes the family's money off as one person's. */
    private static final String HOUSEHOLD = "the whole household together";

    private static final Set<String> EVERYONE =
        Set.of("everyone", "everybody", "household", "family", "all", "us", "we", "both", "combined", "together");

    private static final Set<String> SELF =
        Set.of("me", "my", "myself", "i", "mine", "self", "own");

    /** The words people use for a relation, mapped to the relation as it is stored. */
    private static final Map<String, String> RELATIONS = Map.ofEntries(
        Map.entry("wife", "spouse"),
        Map.entry("husband", "spouse"),
        Map.entry("spouse", "spouse"),
        Map.entry("partner", "spouse"),
        Map.entry("son", "child"),
        Map.entry("daughter", "child"),
        Map.entry("child", "child"),
        Map.entry("kid", "child"),
        Map.entry("mother", "parent"),
        Map.entry("mom", "parent"),
        Map.entry("mum", "parent"),
        Map.entry("father", "parent"),
        Map.entry("dad", "parent"),
        Map.entry("parent", "parent"));

    private final FinanceClient finance;

    public People(FinanceClient finance) {
        this.finance = finance;
    }

    /**
     * Whose money to read, or why we will not.
     *
     * @param memberId the member to scope to; null means the whole household
     * @param label    how to name them in the answer, e.g. "Neha Rani (Spouse)"
     * @param refusal  when set, the tool returns this instead of any figures
     */
    public record Choice(Long memberId, String label, String refusal) {

        public boolean refused() {
            return refusal != null;
        }
    }

    /** Resolve the {@code person} a tool was given, against whoever is signed in. */
    public Choice resolve(String person) {
        Long confinedTo = CallerContext.restrictedTo();
        String want = normalise(person);

        // Nobody named: the household, everyone's money together. The administrator asking "how
        // much did we spend" means the family's money, and splitting it up unasked would answer a
        // question nobody put. Someone confined to one member has only their own to give.
        if (want.isEmpty() || EVERYONE.contains(want)) {
            if (confinedTo != null) {
                return want.isEmpty() ? new Choice(confinedTo, "you", null) : confined();
            }
            return new Choice(null, HOUSEHOLD, null);
        }

        List<FinanceClient.Member> roster;
        try {
            roster = finance.members();
        } catch (Exception e) {
            // Better to say the roster is unreachable than to answer about whoever the default is.
            log.warn("Household roster unavailable while resolving '{}': {}", person, e.toString());
            return new Choice(null, null,
                "I cannot reach the household list right now, so I cannot tell whose figures to read.");
        }
        if (roster == null || roster.isEmpty()) {
            return new Choice(null, null, "No household members are set up yet.");
        }

        if (SELF.contains(want)) {
            FinanceClient.Member self = byRelation(roster, "self");
            Long id = confinedTo != null ? confinedTo : (self == null ? null : self.id());
            return new Choice(id, labelFor(id, roster), null);
        }

        FinanceClient.Member match = match(roster, want);
        if (match == null) {
            return new Choice(null, null,
                "I do not know who '%s' is. The household is: %s. Ask again using one of those names, or leave the person out for the whole household."
                    .formatted(person.trim(), roster.stream().map(FinanceClient.Member::label).reduce((a, b) -> a + ", " + b).orElse("")));
        }
        if (confinedTo != null && !confinedTo.equals(match.id())) {
            return confined();
        }
        return new Choice(match.id(), match.label(), null);
    }

    /** The name to put in an answer when the roster has already been fetched. */
    private static String labelFor(Long memberId, List<FinanceClient.Member> roster) {
        if (memberId == null) {
            return HOUSEHOLD;
        }
        return roster.stream()
            .filter(m -> memberId.equals(m.id()))
            .findFirst()
            .map(FinanceClient.Member::label)
            .orElse("member " + memberId);
    }

    private static Choice confined() {
        return new Choice(null, null,
            "You can only see your own money, so I cannot answer about anyone else in the household.");
    }

    private static FinanceClient.Member byRelation(List<FinanceClient.Member> roster, String relation) {
        return roster.stream()
            .filter(m -> m.relation() != null && m.relation().equalsIgnoreCase(relation))
            .findFirst()
            .orElse(null);
    }

    /** Match on the relation first — "wife" is unambiguous — then on the name, whole or first. */
    private static FinanceClient.Member match(List<FinanceClient.Member> roster, String want) {
        String relation = RELATIONS.get(want);
        if (relation != null) {
            FinanceClient.Member m = byRelation(roster, relation);
            if (m != null) {
                return m;
            }
        }
        for (FinanceClient.Member m : roster) {
            if (m.relation() != null && m.relation().equalsIgnoreCase(want)) {
                return m;
            }
            String name = m.name() == null ? "" : m.name().toLowerCase(Locale.ROOT);
            if (name.equals(want) || name.startsWith(want + " ") || name.endsWith(" " + want)) {
                return m;
            }
        }
        return null;
    }

    /** "My wife's" and "the Wife" are the same word once the grammar is taken off. */
    private static String normalise(String person) {
        if (person == null) {
            return "";
        }
        String s = person.trim().toLowerCase(Locale.ROOT).replaceAll("[.,?!]+$", "");
        s = s.replaceFirst("^(my|our|the)\\s+", "");
        s = s.replaceAll("['’]s$", "");
        return s.trim();
    }
}
