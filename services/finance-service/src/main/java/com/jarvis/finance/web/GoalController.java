package com.jarvis.finance.web;

import com.jarvis.finance.domain.Goal;
import com.jarvis.finance.repo.GoalRepository;
import com.jarvis.finance.service.Scope;
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
    private final Scope scope;

    public GoalController(GoalRepository goals, Scope scope) {
        this.goals = goals;
        this.scope = scope;
    }

    @GetMapping
    public List<Goal> list() {
        return scope.all() ? goals.findAll() : goals.findByMemberId(scope.memberId());
    }

    @PostMapping
    public ResponseEntity<Goal> create(@Valid @RequestBody GoalRequest req) {
        scope.requireOwn(req.memberId());
        Goal g = new Goal();
        apply(g, req);
        return ResponseEntity.status(HttpStatus.CREATED).body(goals.save(g));
    }

    @PutMapping("/{id}")
    public Goal update(@PathVariable Long id, @Valid @RequestBody GoalRequest req) {
        Goal g = mine(id);
        scope.requireOwn(req.memberId());
        apply(g, req);
        return goals.save(g);
    }

    /** Add money toward a goal (a contribution), capping saved at the target. */
    @PostMapping("/{id}/contribute")
    public Goal contribute(@PathVariable Long id, @Valid @RequestBody ContributeRequest req) {
        Goal g = mine(id);
        BigDecimal saved = g.getSavedAmount().add(req.amount());
        if (saved.compareTo(g.getTargetAmount()) > 0) {
            saved = g.getTargetAmount();
        }
        g.setSavedAmount(saved);
        return goals.save(g);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        goals.delete(mine(id));
        return ResponseEntity.noContent().build();
    }

    /** A goal the caller may act on; someone else's reads as missing rather than forbidden. */
    private Goal mine(Long id) {
        return goals.findById(id).filter(g -> scope.canSee(g.getMemberId())).orElseThrow(this::notFound);
    }

    private void apply(Goal g, GoalRequest req) {
        g.setMemberId(scope.resolve(req.memberId()));
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
