package com.jarvis.ingestion.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class AlertHintsTest {

    @Test
    void modelDigitsAreNormalisedToTrailingFour() {
        assertEquals("380", AlertHints.last4Hint("380", "ignored"));
        assertEquals("380", AlertHints.last4Hint("XX380", "ignored"));
        assertEquals("4008", AlertHints.last4Hint("4xxx4008", "ignored"));
        assertEquals("1234", AlertHints.last4Hint("123456781234", "ignored"));
    }

    @Test
    void fallsBackToTextWhenModelGivesNothing() {
        assertEquals("380", AlertHints.last4Hint(null,
            "ICICI Bank Account XX380 credited:Rs. 7,75,283.00 on 31-Aug-26. Info NEFT-HSBCN24381166436-SAMSUN."));
        assertEquals("380", AlertHints.last4Hint("",
            "Dear Customer, Acct XX380 is credited with Rs 5.00 on 18-Aug-26 from GOOGLE INDIA DI."));
        assertEquals("4008", AlertHints.last4Hint("X",
            "INR 2,072.00 spent using ICICI Bank Card XX4008 on 01-Sep-26 on AMAZON PAY IN G."));
        assertEquals("4008", AlertHints.last4Hint(null,
            "Payment of INR 2,719.00 has been received on your ICICI Bank Credit Card Account 4xxx4008 on 03-AUG-26."));
        assertEquals("1507", AlertHints.last4Hint(null,
            "Account  No. XXXXXXXX1507 CREDIT with amount Rs. 5000.00 on 27-08-2026. Balance: Rs.90000.00."));
        assertEquals("6971", AlertHints.last4Hint(null,
            "Dear Customer, Your a/c no. XXXXXXXX6971 is credited by Rs.60000.00 on 08-08-26 by a/c linked to mobile."));
        assertEquals("6971", AlertHints.last4Hint(null,
            "Your A/C XXXXX036971 Debited INR 68,339.00 on 10/05/26 -Transferred to Mr. VISHALBHARTI. Avl Balance INR 7,345.04-SBI"));
    }

    @Test
    void doesNotInventDigitsFromReferences() {
        assertNull(AlertHints.last4Hint(null,
            "Rs 499.00 debited towards SWIGGY via UPI Ref 526412345678. Avl Bal Rs 12,345.67"));
    }

    @Test
    void walletAndPassbookNoticesAreRejected() {
        assertTrue(AlertHints.isNotATransaction(
            "Dear XXXXXXXX8133, your passbook balance against BGBNG****9425 is Rs. 35,43,726/-. Contribution of Rs. 53,994/- received."));
        assertTrue(AlertHints.isNotATransaction("Rs. 37.00 debited from your Swiggy Money. View balance at swiggy.com"));
        assertTrue(AlertHints.isNotATransaction("WALLET CREDIT SUCCESSFUL: Rs. 600 Power Cash on TITAN added to your Power Cash Wallet."));
        assertTrue(AlertHints.isNotATransaction("Payment of Rs 599.00 using Apay balance is successful at A.in. Updated balance is Rs 3536.00."));
        assertTrue(AlertHints.isNotATransaction("Refund of Rs 349 has been initiated for Swiggy order 244039543171381."));
        assertTrue(AlertHints.isNotATransaction("ICICI Bank SAVINGS Account XX380 will be debited for Rs 149.00 on 06-Sep-26 towards Autopay"));
        assertTrue(AlertHints.isNotATransaction("Hi Vishal, we have received a payment of Rs.504 against your rental payment. Thank you for renting with Rentomojo."));
    }

    @Test
    void balanceIsReadFromTextWhenModelGivesNone() {
        assertEquals(new java.math.BigDecimal("90000.00"), AlertHints.balanceHint(null,
            "Account  No. XXXXXXXX1507 CREDIT with amount Rs. 5000.00 on 27-08-2026. Balance: Rs.90000.00. [IN2792298]"));
        assertEquals(new java.math.BigDecimal("904471.87"), AlertHints.balanceHint("",
            "ICICI Bank Account XX380 credited:Rs. 7,75,283.00 on 31-Aug-26. Available Balance is Rs. 9,04,471.87."));
        assertEquals(new java.math.BigDecimal("12345.67"), AlertHints.balanceHint(null,
            "Rs 499.00 debited from A/c XX1234 to SWIGGY via UPI. Avl Bal Rs 12,345.67 -HDFC Bank"));
        assertEquals(new java.math.BigDecimal("777.50"), AlertHints.balanceHint("777.50", "ignored"));
    }

    @Test
    void cardLimitsAreNotBalances() {
        assertNull(AlertHints.balanceHint(null,
            "INR 468.41 spent using ICICI Bank Card XX0009 on 04-Sep-26 on SHELL INDIA MAR. Avl Limit: INR 22,71,544.69."));
    }

    @Test
    void loanAccountDigitsAreReadFromStandingInstructionAlerts() {
        assertEquals("2573", AlertHints.loanAccountLast4(
            "Dear Customer, Standing Instruction has been successfully executed for Rs. 68,339.00 from A/c No.XXXXX036971 to Loan A/c No.XXXXX432573 on 10/08/26.  - SBI."));
        assertEquals("6971", AlertHints.last4Hint(null,
            "Dear Customer, Standing Instruction has been successfully executed for Rs. 68,339.00 from A/c No.XXXXX036971 to Loan A/c No.XXXXX432573 on 10/08/26.  - SBI."));
        assertNull(AlertHints.loanAccountLast4(
            "Your A/C XXXXX036971 Debited INR 68,339.00 on 10/05/26 -Transferred to Mr. VISHALBHARTI. Avl Balance INR 7,345.04-SBI"));
    }

    @Test
    void theCreditedAccountIsReadFromTransferAlerts() {
        assertEquals("971", AlertHints.counterpartyLast4(
            "ICICI Bank Acct XX380 debited with Rs 70,000.00 on 06-Sep-26 & Acct XX971 credited."
                + " IMPS:624917380061. Call 18002662 for dispute or SMS BLOCK 380 to 9215676766", "1380"));
        assertEquals("519", AlertHints.counterpartyLast4(
            "ICICI Bank Acct XX380 debited with Rs 500,000.00 on 31-Jul-26 & Acct XX519 credited."
                + " IMPS:621213060610.", "1380"));
    }

    @Test
    void aPayeeWhoIsNotAnAccountIsNoCounterparty() {
        // A merchant or person credited is spending, however the bank words it.
        assertNull(AlertHints.counterpartyLast4(
            "ICICI Bank Acct XX380 debited for Rs 700.00 on 02-Aug-26; SHAIK ABDUL AZE credited. UPI:621420543940.", "1380"));
        assertNull(AlertHints.counterpartyLast4(
            "INR 475.00 debited from A/c XXXXXXXXXX8519 towards UPI/DR/D625244078380/Flipkart Value 09-SEP-2026", "8519"));
    }

    @Test
    void anEmiToALoanAccountIsNeverACounterparty() {
        // Repaying a loan is real spending; only the "credited" wording marks an own-account move.
        assertNull(AlertHints.counterpartyLast4(
            "Dear Customer, Standing Instruction has been successfully executed for Rs. 68,339.00"
                + " from A/c No.XXXXX036971 to Loan A/c No.XXXXX432573 on 10/09/26.  - SBI.", "6971"));
        assertNull(AlertHints.counterpartyLast4(
            "Your A/C XXXXX036971 Debited INR 68,339.00 on 10/09/26 -Transferred to Mr. VISHALBHARTI."
                + " Avl Balance INR 4,079.04-SBI", "6971"));
    }

    @Test
    void theAlertsOwnAccountIsNotItsCounterparty() {
        // SBI names the receiving account on the credit leg — which is the subject, not another one.
        assertNull(AlertHints.counterpartyLast4(
            "Dear Customer, RTGS transaction with ICICI Bank Reference No. ICICR12026050610533525"
                + " for Rs.500000.00 has been credited to the Beneficiary Account XX6971 on 06-05-26", "6971"));
    }

    @Test
    void realBankAlertsPassThePreFilter() {
        assertFalse(AlertHints.isNotATransaction(
            "ICICI Bank Acct XX380 debited for Rs 700.00 on 02-Aug-26; SHAIK ABDUL AZE credited. UPI:621420543940."));
        assertFalse(AlertHints.isNotATransaction(
            "INR 468.41 spent using ICICI Bank Card XX0009 on 04-Sep-26 on SHELL INDIA MAR. Avl Limit: INR 22,71,544.69."));
        assertFalse(AlertHints.isNotATransaction(
            "Dear Customer, Payment of INR 2,719.00 has been received on your ICICI Bank Credit Card Account 4xxx4008 on 03-AUG-26.Thank you."));
    }
}
