package com.jarvis.ai.agent;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.ollama.api.OllamaChatOptions;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Natural-language Q&A agent (qwen3.5:27b). Answers questions about the user's finances by
 * calling expense-service analytics through its @Tool functions.
 */
@Component
public class QueryAgent {

    private static final String SYSTEM = """
        You are Jarvis, a concise personal-finance assistant for one Indian user.
        Answer questions about their spending, earning and budgets. All amounts are in INR (₹).
        Use the provided tools to fetch real figures before answering — never invent numbers.
        Keep answers short and direct.
        """;

    private final ChatClient chatClient;
    private final ExpenseAnalyticsTools tools;
    private final String agentModel;

    public QueryAgent(
        ChatClient.Builder chatClientBuilder,
        ExpenseAnalyticsTools tools,
        @Value("${jarvis.ai.agent-model}") String agentModel) {
        this.chatClient = chatClientBuilder.build();
        this.tools = tools;
        this.agentModel = agentModel;
    }

    public String ask(String message) {
        return chatClient
            .prompt()
            .system(SYSTEM)
            .user(message)
            .tools(tools)
            .options(OllamaChatOptions.builder().model(agentModel).build())
            .call()
            .content();
    }
}
