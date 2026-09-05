package com.jarvis.finance.web;

import com.jarvis.finance.domain.Reminder;
import com.jarvis.finance.domain.ReminderPayment;
import com.jarvis.finance.repo.ReminderPaymentRepository;
import com.jarvis.finance.repo.ReminderRepository;
import com.jarvis.finance.web.dto.ReminderPaymentDto;
import com.jarvis.finance.web.dto.ReminderRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/reminders")
public class ReminderController {

    private final ReminderRepository reminders;
    private final ReminderPaymentRepository payments;

    public ReminderController(ReminderRepository reminders, ReminderPaymentRepository payments) {
        this.reminders = reminders;
        this.payments = payments;
    }

    @GetMapping
    public List<Reminder> list() {
        return reminders.findAll();
    }

    @PostMapping
    public ResponseEntity<Reminder> create(@Valid @RequestBody ReminderRequest req) {
        Reminder r = new Reminder();
        apply(r, req);
        return ResponseEntity.status(HttpStatus.CREATED).body(reminders.save(r));
    }

    @PutMapping("/{id}")
    public Reminder update(@PathVariable Long id, @Valid @RequestBody ReminderRequest req) {
        Reminder r = reminders.findById(id).orElseThrow(this::notFound);
        apply(r, req);
        return reminders.save(r);
    }

    // ---- Closing an occurrence by hand --------------------------------------------------------
    // A reminder whose amount varies (an electricity bill) can never be closed by matching a
    // transaction, so the user marks it paid; one row per dated occurrence of a monthly reminder.

    /** Every occurrence marked paid on or after {@code from} (default: 12 months back). */
    @GetMapping("/payments")
    public List<ReminderPaymentDto> payments(
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from) {
        LocalDate since = from != null ? from : LocalDate.now().minusMonths(12);
        return payments.findByOccurredOnGreaterThanEqual(since).stream().map(ReminderPaymentDto::from).toList();
    }

    /** Mark one occurrence paid (idempotent: marking it again updates the details). */
    @PostMapping("/{id}/payments")
    public ReminderPaymentDto markPaid(@PathVariable Long id, @Valid @RequestBody MarkPaidRequest req) {
        Reminder r = reminders.findById(id).orElseThrow(this::notFound);
        ReminderPayment p = payments
            .findByReminder_IdAndOccurredOn(id, req.occurredOn())
            .orElseGet(() -> {
                ReminderPayment n = new ReminderPayment();
                n.setReminder(r);
                n.setOccurredOn(req.occurredOn());
                return n;
            });
        p.setPaidOn(req.paidOn() != null ? req.paidOn() : LocalDate.now());
        p.setAmount(req.amount() != null ? req.amount() : r.getAmount());
        p.setTransactionId(req.transactionId());
        return ReminderPaymentDto.from(payments.save(p));
    }

    /** Undo: the occurrence goes back to due / upcoming. */
    @DeleteMapping("/{id}/payments/{occurredOn}")
    public ResponseEntity<Void> unmarkPaid(
        @PathVariable Long id,
        @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate occurredOn) {
        payments.findByReminder_IdAndOccurredOn(id, occurredOn).ifPresent(payments::delete);
        return ResponseEntity.noContent().build();
    }

    public record MarkPaidRequest(
        @NotNull LocalDate occurredOn, LocalDate paidOn, BigDecimal amount, Long transactionId) {}

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        if (!reminders.existsById(id)) throw notFound();
        reminders.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    private void apply(Reminder r, ReminderRequest req) {
        r.setTitle(req.title().trim());
        r.setDate(req.date());
        r.setType(req.type());
        r.setAmount(req.amount());
        r.setNotes(req.notes());
        r.setRepeat(req.repeat() == null || req.repeat().isBlank() ? "none" : req.repeat());
    }

    private ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Reminder not found");
    }
}
