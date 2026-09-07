package com.jarvis.finance.web;

import com.jarvis.finance.domain.Member;
import com.jarvis.finance.repo.MemberRepository;
import com.jarvis.finance.service.Scope;
import com.jarvis.finance.web.dto.MemberRequest;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/members")
public class MemberController {

    private final MemberRepository members;
    private final Scope scope;

    public MemberController(MemberRepository members, Scope scope) {
        this.members = members;
        this.scope = scope;
    }

    @GetMapping
    public List<Member> list() {
        // Someone confined to one member sees only themselves. The household roster is the
        // administrator's to see: it carries everyone else's name, relation and email address.
        return scope.all() ? members.findAll() : members.findAllById(List.of(scope.memberId()));
    }

    @PostMapping
    public ResponseEntity<Member> create(@Valid @RequestBody MemberRequest req) {
        scope.requireAdmin();
        Member m = new Member();
        apply(m, req);
        return ResponseEntity.status(HttpStatus.CREATED).body(members.save(m));
    }

    @PutMapping("/{id}")
    public Member update(@PathVariable Long id, @Valid @RequestBody MemberRequest req) {
        scope.requireAdmin();
        Member m = members.findById(id).orElseThrow(this::notFound);
        apply(m, req);
        return members.save(m);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        scope.requireAdmin();
        if (!members.existsById(id)) throw notFound();
        members.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    private void apply(Member m, MemberRequest req) {
        m.setName(req.name().trim());
        m.setRelation(req.relation() == null || req.relation().isBlank() ? "Other" : req.relation().trim());
        m.setEmail(req.email());
        if (req.earns() != null) {
            m.setEarns(req.earns());
        }
    }

    private ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Member not found");
    }
}
