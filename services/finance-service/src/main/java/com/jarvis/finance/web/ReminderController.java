package com.jarvis.finance.web;

import com.jarvis.finance.domain.Reminder;
import com.jarvis.finance.repo.ReminderRepository;
import com.jarvis.finance.web.dto.ReminderRequest;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/reminders")
public class ReminderController {

    private final ReminderRepository reminders;

    public ReminderController(ReminderRepository reminders) {
        this.reminders = reminders;
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
