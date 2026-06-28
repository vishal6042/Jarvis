package com.jarvis.finance.web;

import com.jarvis.finance.domain.Investment;
import com.jarvis.finance.repo.InvestmentRepository;
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

    public InvestmentController(InvestmentRepository investments) {
        this.investments = investments;
    }

    /** All investments, or just one member's when {@code memberId} is given. */
    @GetMapping
    public List<Investment> list(@RequestParam(required = false) Long memberId) {
        return memberId == null ? investments.findAll() : investments.findByMemberId(memberId);
    }

    @PostMapping
    public ResponseEntity<Investment> create(@Valid @RequestBody InvestmentRequest req) {
        Investment i = new Investment();
        apply(i, req);
        return ResponseEntity.status(HttpStatus.CREATED).body(investments.save(i));
    }

    @PutMapping("/{id}")
    public Investment update(@PathVariable Long id, @Valid @RequestBody InvestmentRequest req) {
        Investment i = investments.findById(id).orElseThrow(this::notFound);
        apply(i, req);
        return investments.save(i);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        if (!investments.existsById(id)) throw notFound();
        investments.deleteById(id);
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
    }

    private ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Investment not found");
    }
}
