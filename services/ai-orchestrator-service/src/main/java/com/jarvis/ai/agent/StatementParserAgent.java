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
 * Scans a chunk of statement text (extracted from a PDF/Excel/CSV) and returns the identified
 * account plus every transaction in it. Bank-agnostic — the model figures out each layout.
 * Uses the FAST parser model (qwen3.5:9b): statements are chunked and scanned sequentially, so the
 * big 27b model is far too slow here (and reloads between chunks). keep-alive keeps it resident.
 */
@Component
public class StatementParserAgent {

    private final ChatClient chatClient;
    private final String parserModel;
    private final String keepAlive;
    private final int numCtx;
    private final int numPredict;
    private final String promptTemplate;
    private final List<String> categories;

    public StatementParserAgent(
        ChatClient.Builder chatClientBuilder,
        @Value("${jarvis.ai.parser-model}") String parserModel,
        @Value("${jarvis.ai.keep-alive}") String keepAlive,
        @Value("${jarvis.ai.statement-num-ctx}") int numCtx,
        @Value("${jarvis.ai.statement-num-predict}") int numPredict,
        @Value("${jarvis.ai.categories}") List<String> categories,
        @Value("classpath:prompts/parse-statement.txt") Resource promptResource) {
        this.chatClient = chatClientBuilder.build();
        this.parserModel = parserModel;
        this.keepAlive = keepAlive;
        this.numCtx = numCtx;
        this.numPredict = numPredict;
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
                    .model(parserModel)
                    .temperature(0.0d)
                    .keepAlive(keepAlive)
                    .numCtx(numCtx)        // big enough to hold chunk + prompt + emitted JSON
                    .numPredict(numPredict) // don't truncate the row list mid-output
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
