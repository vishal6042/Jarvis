package com.jarvis.finance.web;

import com.jarvis.finance.domain.Goal;
import com.jarvis.finance.repo.GoalRepository;
import com.jarvis.finance.web.dto.GoalRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.math.BigDecimal;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/goals")
public class GoalController {

    private final GoalRepository goals;

    public GoalController(GoalRepository goals) {
        this.goals = goals;
    }

    @GetMapping
    public List<Goal> list() {
        return goals.findAll();
    }

    @PostMapping
    public ResponseEntity<Goal> create(@Valid @RequestBody GoalRequest req) {
        Goal g = new Goal();
        apply(g, req);
        return ResponseEntity.status(HttpStatus.CREATED).body(goals.save(g));
    }

    @PutMapping("/{id}")
    public Goal update(@PathVariable Long id, @Valid @RequestBody GoalRequest req) {
        Goal g = goals.findById(id).orElseThrow(this::notFound);
        apply(g, req);
        return goals.save(g);
    }

    /** Add money toward a goal (a contribution), capping saved at the target. */
    @PostMapping("/{id}/contribute")
    public Goal contribute(@PathVariable Long id, @Valid @RequestBody ContributeRequest req) {
        Goal g = goals.findById(id).orElseThrow(this::notFound);
        BigDecimal saved = g.getSavedAmount().add(req.amount());
        if (saved.compareTo(g.getTargetAmount()) > 0) {
            saved = g.getTargetAmount();
        }
        g.setSavedAmount(saved);
        return goals.save(g);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        if (!goals.existsById(id)) throw notFound();
        goals.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    private void apply(Goal g, GoalRequest req) {
        g.setName(req.name().trim());
        g.setTargetAmount(req.targetAmount());
        g.setSavedAmount(req.savedAmount() == null ? BigDecimal.ZERO : req.savedAmount());
        g.setTargetDate(req.targetDate());
        g.setColor(req.color());
        g.setNotes(req.notes());
    }

    private ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Goal not found");
    }

    public record ContributeRequest(@NotNull @Positive BigDecimal amount) {}
}
