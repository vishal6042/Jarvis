package com.jarvis.finance.web;

import com.jarvis.finance.domain.Member;
import com.jarvis.finance.repo.MemberRepository;
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

    public MemberController(MemberRepository members) {
        this.members = members;
    }

    @GetMapping
    public List<Member> list() {
        return members.findAll();
    }

    @PostMapping
    public ResponseEntity<Member> create(@Valid @RequestBody MemberRequest req) {
        Member m = new Member();
        apply(m, req);
        return ResponseEntity.status(HttpStatus.CREATED).body(members.save(m));
    }

    @PutMapping("/{id}")
    public Member update(@PathVariable Long id, @Valid @RequestBody MemberRequest req) {
        Member m = members.findById(id).orElseThrow(this::notFound);
        apply(m, req);
        return members.save(m);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        if (!members.existsById(id)) throw notFound();
        members.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    private void apply(Member m, MemberRequest req) {
        m.setName(req.name().trim());
        m.setRelation(req.relation() == null || req.relation().isBlank() ? "Other" : req.relation().trim());
        m.setEmail(req.email());
    }

    private ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Member not found");
    }
}
