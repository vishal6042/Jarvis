package com.jarvis.ai.agent;

import java.util.List;

/**
 * The structured result of scanning one bank/credit-card statement: the account the statement
 * belongs to (so the backend can match or auto-create it) plus every transaction found.
 */
public record StatementParseResult(
    String bank,            // issuing bank short name, e.g. "HDFC", "ICICI"
    String last4,           // last 4 digits of the account / card
    String accountType,     // "SAVINGS" or "CREDIT_CARD"
    String currency,        // usually "INR"
    List<ParsedTransaction> transactions) {}
