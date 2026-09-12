package com.jarvis.ai.agent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.jarvis.ai.client.FinanceClient;
import com.jarvis.common.security.Caller;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * Who an answer is about. Two halves matter: the household default (nobody named means everyone's
 * money together), and the rule that a sign-in confined to one member cannot reach past it by
 * typing a name into the chat.
 */
class PeopleTest {

    private static final FinanceClient.Member SELF = new FinanceClient.Member(1L, "You", "Self", true);
    private static final FinanceClient.Member WIFE =
        new FinanceClient.Member(2L, "Neha Rani", "Spouse", false);

    private FinanceClient finance;
    private People people;

    @BeforeEach
    void setUp() {
        finance = mock(FinanceClient.class);
        when(finance.members()).thenReturn(List.of(SELF, WIFE));
        people = new People(finance);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    /** Sign in as someone: an admin sees the household, anyone else only their own member. */
    private static void signedInAs(String username, Long memberId, boolean admin) {
        var auth = new UsernamePasswordAuthenticationToken(username, null, List.of());
        auth.setDetails(new Caller(username, memberId, admin));
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    @Test
    @DisplayName("the administrator naming nobody gets the household, not just themselves")
    void defaultIsTheHousehold() {
        signedInAs("darklord", 1L, true);
        People.Choice choice = people.resolve(null);
        assertThat(choice.refused()).isFalse();
        assertThat(choice.memberId()).isNull();
        assertThat(choice.label()).contains("household");

        assertThat(people.resolve("  ").memberId()).isNull();
        assertThat(people.resolve("everyone").memberId()).isNull();
    }

    @Test
    @DisplayName("a relation, a name or a first name all find the same member")
    void findsTheWife() {
        signedInAs("darklord", 1L, true);
        assertThat(people.resolve("my wife").memberId()).isEqualTo(2L);
        assertThat(people.resolve("Wife").memberId()).isEqualTo(2L);
        assertThat(people.resolve("spouse").memberId()).isEqualTo(2L);
        assertThat(people.resolve("Neha").memberId()).isEqualTo(2L);
        assertThat(people.resolve("Neha Rani").memberId()).isEqualTo(2L);
        assertThat(people.resolve("my wife's").memberId()).isEqualTo(2L);
        assertThat(people.resolve("my wife").label()).isEqualTo("Neha Rani (Spouse)");
    }

    @Test
    @DisplayName("'me' means the Self member, not the household")
    void meIsSelf() {
        signedInAs("darklord", 1L, true);
        assertThat(people.resolve("me").memberId()).isEqualTo(1L);
        assertThat(people.resolve("my").memberId()).isEqualTo(1L);
        assertThat(people.resolve("myself").memberId()).isEqualTo(1L);
    }

    @Test
    @DisplayName("a name nobody has is refused, with the roster to retry from")
    void unknownNameIsRefused() {
        signedInAs("darklord", 1L, true);
        People.Choice choice = people.resolve("Priya");
        assertThat(choice.refused()).isTrue();
        assertThat(choice.refusal()).contains("Priya").contains("Neha Rani (Spouse)");
    }

    @Test
    @DisplayName("someone confined to their own money cannot ask about anyone else")
    void confinedCallerCannotReachPastThemselves() {
        signedInAs("neha", 2L, false);

        assertThat(people.resolve(null).memberId()).isEqualTo(2L);
        assertThat(people.resolve("me").memberId()).isEqualTo(2L);

        // The husband by relation, by name, and the household as a whole — all refused.
        assertThat(people.resolve("You").refused()).isTrue();
        assertThat(people.resolve("self").memberId()).isEqualTo(2L);
        assertThat(people.resolve("everyone").refused()).isTrue();
        assertThat(people.resolve("household").refusal()).contains("your own money");
    }

    @Test
    @DisplayName("a confined caller asking about themselves by name is still answered")
    void confinedCallerMayNameThemselves() {
        signedInAs("neha", 2L, false);
        assertThat(people.resolve("Neha").memberId()).isEqualTo(2L);
        assertThat(people.resolve("wife").memberId()).isEqualTo(2L);
    }

    @Test
    @DisplayName("an unreachable roster refuses rather than answering about the wrong person")
    void unreachableRosterRefuses() {
        signedInAs("darklord", 1L, true);
        when(finance.members()).thenThrow(new IllegalStateException("finance-service down"));

        People.Choice named = people.resolve("my wife");
        assertThat(named.refused()).isTrue();
        assertThat(named.refusal()).contains("household list");

        // Naming nobody still works: that needs no roster, it is simply everyone.
        assertThat(people.resolve(null).refused()).isFalse();
    }
}
