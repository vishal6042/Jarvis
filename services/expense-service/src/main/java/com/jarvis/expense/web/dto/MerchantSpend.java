package com.jarvis.expense.web.dto;

import java.math.BigDecimal;

/**
 * What one merchant took over a window. The name is the cleaned-up one where the merchant has been
 * recognised, and the raw alert text otherwise — the assistant should say whichever the user would.
 */
public record MerchantSpend(String merchant, BigDecimal total, int count) {}
