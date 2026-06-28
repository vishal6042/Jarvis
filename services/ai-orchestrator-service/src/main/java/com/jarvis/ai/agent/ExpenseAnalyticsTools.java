package com.jarvis.ai.agent;

import com.jarvis.ai.client.ExpenseClient;
import java.util.stream.Collectors;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.stereotype.Component;

/** Tools the Query/Chatbot agent can call to answer questions from real expense data. */
@Component
public class ExpenseAnalyticsTools {

    private final ExpenseClient expense;

    public ExpenseAnalyticsTools(ExpenseClient expense) {
        this.expense = expense;
    }

    @Tool(description = "Get the user's total spend and total earning (in INR) over the last N days.")
    public String spendingSummary(
        @ToolParam(description = "number of days to look back, e.g. 30") int days) {
        ExpenseClient.Summary s = expense.summary(days);
        return "Last %d days — earning: INR %s, spend: INR %s".formatted(days, s.earning(), s.spend());
    }

    @Tool(description = "Get the user's spend grouped by category (highest first, in INR) over the last N days.")
    public String spendByCategory(
        @ToolParam(description = "number of days to look back, e.g. 30") int days) {
        String rows = expense.byCategory(days).stream()
            .map(c -> "%s: INR %s".formatted(c.category(), c.total()))
            .collect(Collectors.joining("; "));
        return rows.isEmpty() ? "No spending recorded." : rows;
    }
}
