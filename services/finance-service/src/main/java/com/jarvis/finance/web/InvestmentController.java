package com.jarvis.finance.web;

import com.jarvis.finance.domain.Investment;
import com.jarvis.finance.repo.InvestmentRepository;
import com.jarvis.finance.service.Scope;
import com.jarvis.finance.web.dto.InvestmentRequest;
import jakarta.validation.Valid;
import java.math.BigDecimal;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/investments")
public class InvestmentController {

    private final InvestmentRepository investments;
    private final Scope scope;

    public InvestmentController(InvestmentRepository investments, Scope scope) {
        this.investments = investments;
        this.scope = scope;
    }

    /**
     * All investments, or just one member's when {@code memberId} is given. A caller confined to
     * one member gets theirs whatever they ask for.
     */
    @GetMapping
    public List<Investment> list(@RequestParam(required = false) Long memberId) {
        Long member = scope.resolve(memberId);
        return member == null ? investments.findAll() : investments.findByMemberId(member);
    }

    @PostMapping
    public ResponseEntity<Investment> create(@Valid @RequestBody InvestmentRequest req) {
        scope.requireOwn(req.memberId());
        Investment i = new Investment();
        apply(i, req);
        return ResponseEntity.status(HttpStatus.CREATED).body(investments.save(i));
    }

    @PutMapping("/{id}")
    public Investment update(@PathVariable Long id, @Valid @RequestBody InvestmentRequest req) {
        Investment i = investments.findById(id).filter(x -> scope.canSee(x.getMemberId())).orElseThrow(this::notFound);
        scope.requireOwn(req.memberId());
        apply(i, req);
        return investments.save(i);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        Investment i = investments.findById(id).filter(x -> scope.canSee(x.getMemberId())).orElseThrow(this::notFound);
        investments.delete(i);
        return ResponseEntity.noContent().build();
    }

    private void apply(Investment i, InvestmentRequest req) {
        i.setMemberId(req.memberId());
        i.setKind(req.kind());
        i.setName(req.name());
        i.setPrincipal(req.principal() == null ? BigDecimal.ZERO : req.principal());
        i.setCurrent(req.current() == null ? i.getPrincipal() : req.current());
        i.setRate(req.rate());
        i.setSip(req.sip());
        i.setOpeningDate(req.openingDate());
        i.setCommencementDate(req.commencementDate());
        i.setMaturityDate(req.maturityDate());
        i.setNotes(req.notes());
        if (req.salaryDeducted() != null) {
            i.setSalaryDeducted(req.salaryDeducted());
        }
        if (req.contributionFrequency() != null && !req.contributionFrequency().isBlank()) {
            i.setContributionFrequency("yearly".equalsIgnoreCase(req.contributionFrequency()) ? "yearly" : "monthly");
        }
        // Link fields are optional and mostly maintained by ingestion — only overwrite when sent,
        // so an edit from the web form (which doesn't know them) doesn't unlink the account.
        if (req.accountLast4() != null) {
            i.setAccountLast4(req.accountLast4().isBlank() ? null : req.accountLast4().trim());
        }
        if (req.valueAsOf() != null) {
            i.setValueAsOf(req.valueAsOf());
        }
        if (req.lastContributionOn() != null) {
            i.setLastContributionOn(req.lastContributionOn());
        }
    }

    private ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Investment not found");
    }
}
