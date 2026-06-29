package com.jarvis.ai.agent;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.ollama.api.OllamaChatOptions;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

/**
 * Scans a chunk of statement text (extracted from a PDF/CSV) and returns the identified account
 * plus every transaction in it. Bank-agnostic — the model figures out each statement's layout.
 * Uses the larger agent model since this is a harder, multi-row extraction than a single alert.
 */
@Component
public class StatementParserAgent {

    private final ChatClient chatClient;
    private final String agentModel;
    private final String promptTemplate;
    private final List<String> categories;

    public StatementParserAgent(
        ChatClient.Builder chatClientBuilder,
        @Value("${jarvis.ai.agent-model}") String agentModel,
        @Value("${jarvis.ai.categories}") List<String> categories,
        @Value("classpath:prompts/parse-statement.txt") Resource promptResource) {
        this.chatClient = chatClientBuilder.build();
        this.agentModel = agentModel;
        this.categories = categories;
        this.promptTemplate = readResource(promptResource);
    }

    public StatementParseResult parse(String statementText) {
        String system = promptTemplate.replace("{categories}", String.join(", ", categories));
        return chatClient
            .prompt()
            .system(system)
            .user(statementText)
            .options(
                OllamaChatOptions.builder()
                    .model(agentModel)
                    .temperature(0.0d)
                    .disableThinking()
                    .build())
            .call()
            .entity(StatementParseResult.class);
    }

    private static String readResource(Resource resource) {
        try {
            return resource.getContentAsString(StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to load statement prompt template", e);
        }
    }
}
