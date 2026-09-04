package com.jarvis.ai.agent;

import java.util.List;

/**
 * An LLM-assessed financial-health score.
 *
 * @param score    1–100 (higher is healthier)
 * @param rating   one word: Excellent / Good / Fair / Needs work
 * @param headline one short line — motivational when strong, honest-but-kind otherwise
 * @param tips      2–4 short, actionable tips (or encouragement when already strong)
 */
public record FinanceScore(int score, String rating, String headline, List<String> tips) {}
