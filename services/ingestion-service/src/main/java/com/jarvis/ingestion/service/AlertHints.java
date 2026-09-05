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

    /** The loan account an EMI went to: "to Loan A/c No.XXXXX432573" → "2573". */
    private static final Pattern LOAN_REF = Pattern.compile(
        "(?i)loan\\s*a/?c(?:count)?(?:\\s*(?:no\\.?|number))?\\s*:?\\s*[xX*]*(\\d{2,})\\b");

    /** Digits of the loan account named in the text, or null. */
    public static String loanAccountLast4(String text) {
        if (text == null) {
            return null;
        }
        Matcher m = LOAN_REF.matcher(text);
        return m.find() ? trailingDigits(m.group(1)) : null;
    }

    /** Bare masked numbers without a keyword, e.g. "XXXXXXXX1507 CREDIT" — lower confidence, so tried last. */
    private static final Pattern BARE_MASKED = Pattern.compile("[xX*]{4,}(\\d{3,})\\b");

    /**
     * EPFO passbook alerts, e.g. "your passbook balance against BGBNG**************9425 is
     * Rs. 35,97,720/-. Contribution of Rs. 53,994/- for due month Jun-26 has been received."
     * The format is fixed, so this is read directly rather than sent to the model: the generic
     * account matcher would pick up the UAN in "Dear XXXXXXXX8133" instead of the PF account.
     */
    private static final Pattern EPF_PASSBOOK = Pattern.compile(
        "(?i)passbook\\s+balance\\s+against\\s+\\S*?(\\d{3,})\\s+is\\s+(?:rs\\.?|inr|₹)\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)");

    private static final Pattern EPF_CONTRIBUTION = Pattern.compile(
        "(?i)contribution\\s+of\\s+(?:rs\\.?|inr|₹)\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)");

    /** "for due month Jun-26" — the month the contribution belongs to, not when the SMS arrived. */
    private static final Pattern EPF_DUE_MONTH = Pattern.compile(
        "(?i)due\\s+month\\s+([A-Za-z]{3})-(\\d{2})");

    /**
     * @param last4        the PF account's trailing digits
     * @param balance      the passbook balance stated in the alert
     * @param contribution the month's contribution, null when the alert states none
     * @param dueMonth     first day of the month the contribution is for
     */
    public record EpfAlert(
        String last4,
        java.math.BigDecimal balance,
        java.math.BigDecimal contribution,
        java.time.LocalDate dueMonth) {}

    /** The EPF figures in this alert, or null when it is not an EPFO passbook message. */
    public static EpfAlert epfAlert(String text) {
        if (text == null) {
            return null;
        }
        Matcher m = EPF_PASSBOOK.matcher(text);
        if (!m.find()) {
            return null;
        }
        java.math.BigDecimal balance = toAmount(m.group(2));
        if (balance == null) {
            return null;
        }
        Matcher c = EPF_CONTRIBUTION.matcher(text);
        java.math.BigDecimal contribution = c.find() ? toAmount(c.group(1)) : null;

        java.time.LocalDate dueMonth = null;
        Matcher d = EPF_DUE_MONTH.matcher(text);
        if (d.find()) {
            try {
                java.time.Month month = java.time.Month.valueOf(d.group(1).toUpperCase().substring(0, 3)
                    .replace("JAN", "JANUARY").replace("FEB", "FEBRUARY").replace("MAR", "MARCH")
                    .replace("APR", "APRIL").replace("MAY", "MAY").replace("JUN", "JUNE")
                    .replace("JUL", "JULY").replace("AUG", "AUGUST").replace("SEP", "SEPTEMBER")
                    .replace("OCT", "OCTOBER").replace("NOV", "NOVEMBER").replace("DEC", "DECEMBER"));
                dueMonth = java.time.LocalDate.of(2000 + Integer.parseInt(d.group(2)), month, 1);
            } catch (RuntimeException ignored) {
                dueMonth = null;
            }
        }
        return new EpfAlert(trailingDigits(m.group(1)), balance, contribution, dueMonth);
    }

    /**
     * NPS alerts from Protean/NSDL come in two shapes, both naming the PRAN:
     * a contribution credit — "PRAN XX0671: Units for (JUL-2026) contribution of Rs.6906.00
     * credited with NAV of 10/08/26", or the older "Units against Contribution (JUN-2023)-Rs.4,678.60
     * credited to PRAN XX0671, NAV of 12/07/23" — and a quarterly valuation, "Investment value in
     * Tier I (PRANXX0671) as on 30.06.2026 is Rs 3,06,445.19".
     */
    private static final Pattern NPS_PRAN = Pattern.compile("(?i)PRAN[\\s:\\-]*[xX*]*(\\d{3,})");

    private static final Pattern NPS_CONTRIBUTION_NEW = Pattern.compile(
        "(?i)contribution of Rs\\.?\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)\\s*credited with NAV of\\s*(\\d{2})[/-](\\d{2})[/-](\\d{2,4})");

    private static final Pattern NPS_CONTRIBUTION_OLD = Pattern.compile(
        "(?i)Units against .{0,40}?Rs\\.?\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)\\s*credited to PRAN.{0,40}?NAV[\\s\\-]*(?:of\\s*)?(\\d{2})[/-](\\d{2})[/-](\\d{2,4})");

    private static final Pattern NPS_VALUATION = Pattern.compile(
        "(?i)Investment value in .{0,30}?as on\\s*(\\d{2})\\.(\\d{2})\\.(\\d{2,4})\\s*is Rs\\.?\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)");

    /**
     * @param last4        the PRAN's trailing digits
     * @param contribution the amount credited, null on a valuation message
     * @param value        the stated portfolio value, null on a contribution message
     * @param on           the NAV date of the credit, or the date the valuation is stated as of
     */
    public record NpsAlert(
        String last4,
        java.math.BigDecimal contribution,
        java.math.BigDecimal value,
        java.time.LocalDate on) {}

    /** The NPS figures in this alert, or null when it is not an NPS contribution or valuation. */
    public static NpsAlert npsAlert(String text) {
        if (text == null) {
            return null;
        }
        Matcher pran = NPS_PRAN.matcher(text);
        if (!pran.find()) {
            return null;
        }
        String last4 = trailingDigits(pran.group(1));

        Matcher v = NPS_VALUATION.matcher(text);
        if (v.find()) {
            java.time.LocalDate on = date(v.group(3), v.group(2), v.group(1));
            java.math.BigDecimal value = toAmount(v.group(4));
            return on == null || value == null ? null : new NpsAlert(last4, null, value, on);
        }
        Matcher c = NPS_CONTRIBUTION_NEW.matcher(text);
        if (!c.find()) {
            c = NPS_CONTRIBUTION_OLD.matcher(text);
            if (!c.find()) {
                return null;
            }
        }
        java.time.LocalDate on = date(c.group(4), c.group(3), c.group(2));
        java.math.BigDecimal amount = toAmount(c.group(1));
        return on == null || amount == null ? null : new NpsAlert(last4, amount, null, on);
    }

    /** Two-digit years in these alerts are always this century. */
    private static java.time.LocalDate date(String year, String month, String day) {
        try {
            int y = Integer.parseInt(year);
            return java.time.LocalDate.of(y < 100 ? 2000 + y : y, Integer.parseInt(month), Integer.parseInt(day));
        } catch (RuntimeException e) {
            return null;
        }
    }

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

    /** "Avl Bal Rs 12,345.67", "Available Balance is Rs. 9,04,471.87", "Balance: Rs.90000.00" — group 1 is the number. */
    private static final Pattern BALANCE = Pattern.compile(
        "(?i)(?:avl|avbl|available|closing)?\\s*(?:bal|balance)\\s*(?:is)?\\s*:?\\s*(?:rs\\.?|inr|₹)\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)");

    /** Balance stated in the alert: the model's answer if numeric, else read from the text (cards' limits are never matched). */
    public static java.math.BigDecimal balanceHint(String modelBalance, String text) {
        java.math.BigDecimal fromModel = toAmount(modelBalance);
        if (fromModel != null) {
            return fromModel;
        }
        if (text == null || text.toLowerCase().contains("limit")) {
            return null;
        }
        Matcher m = BALANCE.matcher(text);
        return m.find() ? toAmount(m.group(1)) : null;
    }

    static java.math.BigDecimal toAmount(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String cleaned = raw.replaceAll("[^0-9.]", "");
        if (cleaned.isEmpty() || cleaned.equals(".")) {
            return null;
        }
        try {
            return new java.math.BigDecimal(cleaned);
        } catch (NumberFormatException e) {
            return null;
        }
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
