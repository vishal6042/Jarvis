package com.jarvis.expense.domain;

/** Money movement relative to the user's account. */
public enum Direction {
    DEBIT,   // money out (spend, withdrawal, card purchase)
    CREDIT   // money in (refund, salary, transfer received)
}
