package com.jarvis.finance.web;

import com.jarvis.finance.domain.Loan;
import com.jarvis.finance.repo.LoanRepository;
import com.jarvis.finance.web.dto.LoanRequest;
import jakarta.validation.Valid;
import java.math.BigDecimal;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/loans")
public class LoanController {

    private final LoanRepository loans;

    public LoanController(LoanRepository loans) {
        this.loans = loans;
    }

    @GetMapping
    public List<Loan> list(@RequestParam(required = false) Long memberId) {
        return memberId == null ? loans.findAll() : loans.findByMemberId(memberId);
    }

    @PostMapping
    public ResponseEntity<Loan> create(@Valid @RequestBody LoanRequest req) {
        Loan l = new Loan();
        apply(l, req);
        return ResponseEntity.status(HttpStatus.CREATED).body(loans.save(l));
    }

    @PutMapping("/{id}")
    public Loan update(@PathVariable Long id, @Valid @RequestBody LoanRequest req) {
        Loan l = loans.findById(id).orElseThrow(this::notFound);
        apply(l, req);
        return loans.save(l);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        if (!loans.existsById(id)) throw notFound();
        loans.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    private void apply(Loan l, LoanRequest req) {
        l.setMemberId(req.memberId());
        l.setKind(req.kind());
        l.setLender(req.lender());
        l.setSanctioned(req.sanctioned() == null ? BigDecimal.ZERO : req.sanctioned());
        l.setOutstanding(req.outstanding() == null ? BigDecimal.ZERO : req.outstanding());
        l.setEmi(req.emi() == null ? BigDecimal.ZERO : req.emi());
        l.setRate(req.rate());
        l.setTenureMonths(req.tenureMonths());
        l.setStartDate(req.startDate());
        l.setEndDate(req.endDate());
        l.setNotes(req.notes());
    }

    private ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Loan not found");
    }
}
