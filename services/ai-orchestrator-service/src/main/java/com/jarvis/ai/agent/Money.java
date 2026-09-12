package com.jarvis.ai.agent;

import java.math.BigDecimal;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.Locale;

/** Amounts as the user reads them: Indian digit grouping, 1,14,716 rather than 114,716. */
final class Money {

    private Money() {}

    /**
     * A fresh formatter each time — DecimalFormat is not safe to share between the threads
     * answering chats, and the cost is nothing next to the model call it is feeding.
     */
    static String inr(BigDecimal amount) {
        DecimalFormat format =
            new DecimalFormat("##,##,##0.##", DecimalFormatSymbols.getInstance(Locale.ENGLISH));
        return format.format(amount == null ? BigDecimal.ZERO : amount);
    }

    /** The same, with the symbol — for a card caption, which is read rather than parsed. */
    static String rupees(BigDecimal amount) {
        return "₹" + inr(amount);
    }
}
