package com.jarvis.expense.service;

import com.jarvis.common.security.CallerContext;
import com.jarvis.expense.domain.Account;
import com.jarvis.expense.repo.AccountRepository;
import java.util.List;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * What the caller is allowed to see. An administrator (and a service-to-service call, which carries
 * no user token) sees the whole household; anyone else sees only the accounts belonging to their
 * member. Queries take {@code all} alongside {@code accountIds} so an unrestricted read still
 * includes rows that are not linked to any account.
 */
@Component
public class Scope {

    private final AccountRepository accounts;

    public Scope(AccountRepository accounts) {
        this.accounts = accounts;
    }

    /** Null when the caller sees everything, otherwise the single member they are confined to. */
    public Long memberId() {
        return CallerContext.restrictedTo();
    }

    public boolean all() {
        return memberId() == null;
    }

    /** As {@link #accountIds()} but for an explicitly named member (null = the whole household). */
    public List<Long> accountIdsOf(Long member) {
        if (member == null) {
            return List.of(-1L);
        }
        List<Long> ids = accounts.findByMemberId(member).stream().map(Account::getId).toList();
        return ids.isEmpty() ? List.of(-1L) : ids;
    }

    /**
     * The accounts this caller may read. Never empty — an empty {@code in} list is not valid SQL,
     * so a member with no accounts yet gets an id that cannot match.
     */
    public List<Long> accountIds() {
        Long member = memberId();
        if (member == null) {
            return List.of(-1L); // Unused: every query pairs this with all() = true.
        }
        List<Long> ids = accounts.findByMemberId(member).stream().map(Account::getId).toList();
        return ids.isEmpty() ? List.of(-1L) : ids;
    }

    /**
     * Refuse anything that reaches beyond one person: adding accounts, rewriting merchant names,
     * re-running the transfer pass, purging data. Those change what the whole household sees.
     */
    public void requireAdmin() {
        if (!all()) {
            throw new ResponseStatusException(
                org.springframework.http.HttpStatus.FORBIDDEN,
                "Only the household administrator can change this.");
        }
    }

    /** Whether the caller may read this account at all. */
    public boolean canSee(Account account) {
        Long member = memberId();
        return member == null || member.equals(account.getMemberId());
    }
}
