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
 */
@Component
public class FinanceScoreAgent {

    private final ChatClient chatClient;
    private final String model;
    private final String keepAlive;
    private final String promptTemplate;

    public FinanceScoreAgent(
        ChatClient.Builder chatClientBuilder,
        @Value("${jarvis.ai.parser-model}") String model,
        @Value("${jarvis.ai.keep-alive}") String keepAlive,
        @Value("classpath:prompts/finance-score.txt") Resource promptResource) {
        this.chatClient = chatClientBuilder.build();
        this.model = model;
        this.keepAlive = keepAlive;
        this.promptTemplate = readResource(promptResource);
    }

    public FinanceScore score(String metrics) {
        return chatClient
            .prompt()
            .system(promptTemplate)
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
