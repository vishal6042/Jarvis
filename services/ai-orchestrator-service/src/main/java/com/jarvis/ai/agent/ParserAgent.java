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
 * Default {@link TransactionParser}: local Ollama via Spring AI. Uses the small parser model
 * (qwen3.5:9b) with structured output and thinking disabled for speed. The allowed categories
 * are injected from config so this service stays stateless (no DB).
 */
@Component
public class ParserAgent implements TransactionParser {

    private final ChatClient chatClient;
    private final String parserModel;
    private final String promptTemplate;
    private final List<String> categories;

    public ParserAgent(
        ChatClient.Builder chatClientBuilder,
        @Value("${jarvis.ai.parser-model}") String parserModel,
        @Value("${jarvis.ai.categories}") List<String> categories,
        @Value("classpath:prompts/parse-transaction.txt") Resource promptResource) {
        this.chatClient = chatClientBuilder.build();
        this.parserModel = parserModel;
        this.categories = categories;
        this.promptTemplate = readResource(promptResource);
    }

    @Override
    public ParsedTransaction parse(String alertText) {
        String system = promptTemplate.replace("{categories}", String.join(", ", categories));
        return chatClient
            .prompt()
            .system(system)
            .user(alertText)
            .options(
                OllamaChatOptions.builder()
                    .model(parserModel)
                    .temperature(0.0d)
                    .disableThinking() // extraction task — skip chain-of-thought for speed
                    .build())
            .call()
            .entity(ParsedTransaction.class);
    }

    private static String readResource(Resource resource) {
        try {
            return resource.getContentAsString(StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to load prompt template", e);
        }
    }
}
