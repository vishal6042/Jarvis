package com.jarvis.sync.sms

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The filter decides what leaves the phone at all, so anything it drops is invisible everywhere
 * else — no server log, no Inbox row, nothing to notice. Three years of EPFO alerts were lost that
 * way once already, to a filter on the server side. These cases pin the shapes that must survive.
 */
class SmsFilterTest {

    @Test
    fun `keeps an ordinary card alert`() {
        assertTrue(
            SmsFilter.looksLikeTransaction(
                "INR 468.41 spent using ICICI Bank Card XX0009 on 04-Sep-26 on SHELL INDIA MAR. " +
                    "Avl Limit: INR 22,71,544.69."
            )
        )
    }

    @Test
    fun `keeps an EPFO passbook alert`() {
        assertTrue(
            SmsFilter.looksLikeTransaction(
                "Dear Member, Amount of Rs. 8,325/- has been credited against EPF A/c no " +
                    "XXXXXXXX9425 for the due month 072026. Passbook Balance is Rs. 12,34,567/-. " +
                    "Regards EPFO"
            )
        )
    }

    @Test
    fun `keeps an NPS contribution alert`() {
        assertTrue(
            SmsFilter.looksLikeTransaction(
                "Dear Subscriber, Contribution of Rs 5000.00 has been credited in your PRAN " +
                    "1100XXXXX0671 on 01-08-2026 - Protean CRA"
            )
        )
    }

    @Test
    fun `keeps an NPS valuation alert, which names no transaction at all`() {
        assertTrue(
            SmsFilter.looksLikeTransaction(
                "Dear Subscriber, your NPS investment value as on 30-06-2026 is Rs. 4,56,789.12 " +
                    "for PRAN 1100XXXXX0671."
            )
        )
    }

    @Test
    fun `drops an OTP`() {
        assertFalse(
            SmsFilter.looksLikeTransaction(
                "123456 is your OTP for a transaction of Rs 2,500 on your ICICI Bank Card. " +
                    "Do not share it with anyone."
            )
        )
    }

    @Test
    fun `drops a promotion`() {
        assertFalse(
            SmsFilter.looksLikeTransaction("Flat Rs 500 cashback offer on your next UPI payment. Click here!")
        )
    }

    @Test
    fun `drops a message with no money in it`() {
        assertFalse(SmsFilter.looksLikeTransaction("Your account statement is ready to download."))
    }
}
