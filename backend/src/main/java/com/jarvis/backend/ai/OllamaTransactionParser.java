package com.jarvis.backend.ai;

import com.jarvis.backend.repo.CategoryRepository;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.ollama.api.OllamaChatOptions;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

/**
 * Default {@link TransactionParser}: local Ollama via Spring AI. Uses the small parser model
 * (qwen3.5:9b) with structured output. The system prompt is externalised so a stronger model
 * can get a leaner prompt without code changes.
 */
@Component
public class OllamaTransactionParser implements TransactionParser {

    private final ChatClient chatClient;
    private final CategoryRepository categories;
    private final String parserModel;
    private final String promptTemplate;

    public OllamaTransactionParser(
        ChatClient.Builder chatClientBuilder,
        CategoryRepository categories,
        @Value("${jarvis.ai.parser-model}") String parserModel,
        @Value("classpath:prompts/parse-transaction.txt") Resource promptResource) {
        this.chatClient = chatClientBuilder.build();
        this.categories = categories;
        this.parserModel = parserModel;
        this.promptTemplate = readResource(promptResource);
    }

    @Override
    public ParsedTransaction parse(String alertText) {
        String system = promptTemplate.replace("{categories}", allowedCategories());
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

    private String allowedCategories() {
        List<String> names = categories.findAll().stream().map(c -> c.getName()).toList();
        return names.isEmpty() ? "Uncategorized" : names.stream().collect(Collectors.joining(", "));
    }

    private static String readResource(Resource resource) {
        try {
            return resource.getContentAsString(StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to load prompt template", e);
        }
    }
}
