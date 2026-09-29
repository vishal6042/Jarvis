package com.jarvis.ai.agent;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.ollama.api.OllamaChatOptions;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.stereotype.Component;
import org.springframework.util.MimeType;

/**
 * Reads a payment screenshot or a receipt photo (a UPI "payment successful" screen, a shop bill)
 * into a transaction for the person to confirm. Runs on the local vision-capable model, so the
 * image never leaves the machine; nothing is saved here — the web app shows it for confirmation.
 */
@Component
public class ReceiptAgent {

    private static final Logger log = LoggerFactory.getLogger(ReceiptAgent.class);

    private static final String PROMPT =
        """
        This image is a payment screenshot or a receipt from India. Read it and reply with one JSON
        object and nothing else:
          {"amount": <number, rupees>, "merchant": "<who was paid, as a person would name them>",
           "occurredOn": "yyyy-MM-dd", "direction": "DEBIT" | "CREDIT",
           "method": "UPI" | "CARD" | "CASH" | "NETBANKING" | null,
           "reference": "<UPI or transaction reference, if shown>",
           "category": "<one of the allowed categories>", "confidence": <0.0-1.0>}
        Rules:
        - amount is the total actually paid, not an item price or a balance.
        - "Paid to X" / "Sent to X" -> DEBIT, merchant X. "Received from X" -> CREDIT.
        - When the year is missing use TODAY's year. When the date is missing use TODAY.
        - Read only what is in the image. A field you cannot read is null; never invent one.
        - confidence below 0.6 when the image is not a payment or is hard to read.
        """;

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ReadReceipt(
        Double amount,
        String merchant,
        String occurredOn,
        String direction,
        String method,
        String reference,
        String category,
        Double confidence) {}

    private final ChatClient chatClient;
    private final String model;
    private final String keepAlive;

    public ReceiptAgent(
        ChatClient.Builder builder,
        @Value("${jarvis.ai.vision-model:${jarvis.ai.parser-model}}") String model,
        @Value("${jarvis.ai.keep-alive}") String keepAlive) {
        this.chatClient = builder.build();
        this.model = model;
        this.keepAlive = keepAlive;
    }

    public ReadReceipt read(byte[] image, String mimeType, String today, List<String> categories) {
        String text = PROMPT + "\nTODAY: " + today + "\nAllowed categories: " + String.join(", ", categories);
        try {
            ReadReceipt r = chatClient
                .prompt()
                .user(u -> u.text(text).media(MimeType.valueOf(mimeType), new ByteArrayResource(image)))
                .options(OllamaChatOptions.builder().model(model).temperature(0.0).keepAlive(keepAlive).disableThinking().build())
                .call()
                .entity(ReadReceipt.class);
            if (r == null) {
                return unreadable();
            }
            String category = r.category() == null ? null
                : categories.stream().filter(c -> c.equalsIgnoreCase(r.category().trim())).findFirst().orElse(null);
            return new ReadReceipt(
                r.amount(), r.merchant(), r.occurredOn(),
                "CREDIT".equalsIgnoreCase(r.direction()) ? "CREDIT" : "DEBIT",
                r.method(), r.reference(), category,
                r.confidence() == null ? 0.5 : Math.max(0, Math.min(1, r.confidence())));
        } catch (RuntimeException e) {
            log.warn("receipt read failed: {}", e.getMessage());
            return unreadable();
        }
    }

    private static ReadReceipt unreadable() {
        return new ReadReceipt(null, null, null, "DEBIT", null, null, null, 0.0);
    }
}
