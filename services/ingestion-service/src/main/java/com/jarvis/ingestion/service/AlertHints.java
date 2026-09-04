package com.jarvis.ingestion.service;

import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Deterministic helpers that sit around the LLM parser. The small local model is good at amounts
 * and merchants but inconsistent on two things that matter for account linking and noise:
 * <ul>
 *   <li>the masked account/card digits ("Acct XX380", "Card 4xxx4008") — it sometimes returns null
 *       for a format it handled a moment earlier, so we read them from the text ourselves;</li>
 *   <li>wallet / passbook / merchant notices that look like bank alerts — rejected up front so
 *       they never become transactions.</li>
 * </ul>
 */
public final class AlertHints {

    private AlertHints() {}

    /** Text that is never a bank transaction, whatever the model thinks (case-insensitive). */
    private static final List<Pattern> NOT_A_TRANSACTION = List.of(
        Pattern.compile("passbook balance", Pattern.CASE_INSENSITIVE),
        Pattern.compile("swiggy money", Pattern.CASE_INSENSITIVE),
        Pattern.compile("power cash", Pattern.CASE_INSENSITIVE),
        Pattern.compile("wallet (credit|debit|balance)", Pattern.CASE_INSENSITIVE),
        Pattern.compile("\\b(apay|amazon pay) balance", Pattern.CASE_INSENSITIVE),
        Pattern.compile("gift card", Pattern.CASE_INSENSITIVE),
        Pattern.compile("refund .{0,40}(initiated|will (be )?reflect)", Pattern.CASE_INSENSITIVE),
        Pattern.compile("will be debited", Pattern.CASE_INSENSITIVE),
        Pattern.compile("we have (successfully )?(received|processed) (a |your )?payment", Pattern.CASE_INSENSITIVE),
        Pattern.compile("thank you for (renting|your payment)", Pattern.CASE_INSENSITIVE),
        Pattern.compile("statement .{0,30}(generated|is ready)", Pattern.CASE_INSENSITIVE),
        Pattern.compile("\\bOTP\\b", Pattern.CASE_INSENSITIVE));

    /**
     * Masked account / card references: "Acct XX380", "A/c XXXX5678", "Card XX4008", "Account No.
     * XXXXXXXX1507", "a/c no. XXXXXXXX6971", "Credit Card Account 4xxx4008", "Card ending 1234".
     * Group 1 is the trailing digits (2–4 of them).
     */
    private static final Pattern MASKED_REF = Pattern.compile(
        "(?i)(?:a/?c|acct|account|card)(?:\\s*(?:no\\.?|number|ending(?:\\s+in|\\s+with)?))?\\s*:?\\s*"
            + "(?:\\d{0,2}[xX*]{1,12}|[xX*]{2,12}|ending\\s+)(\\d{2,})\\b");

    /** Bare masked numbers without a keyword, e.g. "XXXXXXXX1507 CREDIT" — lower confidence, so tried last. */
    private static final Pattern BARE_MASKED = Pattern.compile("[xX*]{4,}(\\d{3,})\\b");

    /** True when the text is a wallet / passbook / merchant notice that must not become a transaction. */
    public static boolean isNotATransaction(String text) {
        if (text == null) {
            return false;
        }
        return NOT_A_TRANSACTION.stream().anyMatch(p -> p.matcher(text).find());
    }

    /**
     * The account/card digits to match on: the model's answer normalised to its trailing digits
     * (max 4), or, when the model gave nothing usable, the digits read from the text.
     */
    public static String last4Hint(String modelLast4, String text) {
        String fromModel = trailingDigits(modelLast4);
        if (fromModel != null) {
            return fromModel;
        }
        if (text == null) {
            return null;
        }
        Matcher m = MASKED_REF.matcher(text);
        if (m.find()) {
            return trailingDigits(m.group(1)); // "036971" after a mask → "6971"
        }
        Matcher bare = BARE_MASKED.matcher(text);
        return bare.find() ? trailingDigits(bare.group(1)) : null;
    }

    /** "XX380" → "380", "4xxx4008" → "4008", "1234" → "1234", "" / "X" → null. */
    static String trailingDigits(String raw) {
        if (raw == null) {
            return null;
        }
        String digits = raw.replaceAll("\\D", "");
        if (digits.length() < 2) {
            return null;
        }
        return digits.length() > 4 ? digits.substring(digits.length() - 4) : digits;
    }
}
