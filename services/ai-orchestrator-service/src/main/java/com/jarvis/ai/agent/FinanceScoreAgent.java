package com.jarvis.ai.agent;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.ollama.api.OllamaChatOptions;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

/**
 * Rates the user's financial health 1–100 from a few monthly metrics and writes a short headline plus
 * improvement tips. Uses the fast parser model (kept resident) so the dashboard card stays responsive.
 *
 * <p>Two rubrics: the usual one, built on income ratios, and one for a member with no income of
 * their own, built on the buffer they keep, how steadily they spend, and what is invested.
 */
@Component
public class FinanceScoreAgent {

    private final ChatClient chatClient;
    private final String model;
    private final String keepAlive;
    private final String earnerPrompt;
    private final String householdPrompt;

    public FinanceScoreAgent(
        ChatClient.Builder chatClientBuilder,
        @Value("${jarvis.ai.parser-model}") String model,
        @Value("${jarvis.ai.keep-alive}") String keepAlive,
        @Value("classpath:prompts/finance-score.txt") Resource earnerPrompt,
        @Value("classpath:prompts/finance-score-no-income.txt") Resource householdPrompt) {
        this.chatClient = chatClientBuilder.build();
        this.model = model;
        this.keepAlive = keepAlive;
        this.earnerPrompt = readResource(earnerPrompt);
        this.householdPrompt = readResource(householdPrompt);
    }

    /**
     * @param earns whether this person has an income of their own. When they do not, a different
     *     rubric applies: income ratios would all read as zero and rate them badly for a situation
     *     that is not a financial problem.
     */
    public FinanceScore score(String metrics, boolean earns) {
        return chatClient
            .prompt()
            .system(earns ? earnerPrompt : householdPrompt)
            .user(metrics)
            .options(
                OllamaChatOptions.builder()
                    .model(model)
                    .temperature(0.3d)
                    .keepAlive(keepAlive)
                    .disableThinking()
                    .build())
            .call()
            .entity(FinanceScore.class);
    }

    private static String readResource(Resource resource) {
        try {
            return resource.getContentAsString(StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to load finance-score prompt template", e);
        }
    }
}
