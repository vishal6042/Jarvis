package com.jarvis.expense.web;

import com.jarvis.expense.service.RecurringService;
import com.jarvis.expense.web.dto.RecurringPayment;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Detected recurring payments / subscriptions from the user's transaction history. */
@RestController
@RequestMapping("/api/recurring")
public class RecurringController {

    private final RecurringService recurring;

    public RecurringController(RecurringService recurring) {
        this.recurring = recurring;
    }

    @GetMapping
    public List<RecurringPayment> list() {
        return recurring.detect();
    }
}
