package com.jarvis.ai.web;

import com.jarvis.ai.agent.FilterAgent;
import com.jarvis.ai.agent.ReceiptAgent;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Base64;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Small AI helpers the web app calls from its pages (JWT via the gateway):
 *  - {@code POST /api/ai/filter}  — a typed search into transaction filters;
 *  - {@code POST /api/ai/receipt} — a payment screenshot or receipt into a transaction to confirm.
 * Neither saves anything.
 */
@RestController
public class AssistController {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    /** A phone screenshot is well under this; anything bigger is not a receipt. */
    private static final int MAX_IMAGE_BYTES = 8 * 1024 * 1024;
    private static final List<String> DEFAULT_CATEGORIES = List.of(
        "Food", "Groceries", "Shopping", "Transport", "Bills & Utilities", "Entertainment",
        "Health", "Personal care", "Travel", "Education", "Rent", "Family support", "Loan EMI", "Transfers", "Income", "Miscellaneous");

    private final FilterAgent filters;
    private final ReceiptAgent receipts;

    public AssistController(FilterAgent filters, ReceiptAgent receipts) {
        this.filters = filters;
        this.receipts = receipts;
    }

    @PostMapping("/api/ai/filter")
    public FilterAgent.TransactionFilter filter(@Valid @RequestBody FilterRequest req) {
        return filters.parse(
            req.query().trim(),
            req.today() == null ? LocalDate.now(IST).toString() : req.today(),
            req.categories() == null || req.categories().isEmpty() ? DEFAULT_CATEGORIES : req.categories(),
            req.accounts() == null ? List.of() : req.accounts());
    }

    public record FilterRequest(@NotBlank String query, String today, List<String> categories, List<FilterAgent.AccountRef> accounts) {}

    @PostMapping("/api/ai/receipt")
    public ReceiptAgent.ReadReceipt receipt(@RequestBody ReceiptRequest req) {
        if (req.image() == null || req.image().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No image");
        }
        String mime = req.mimeType() == null ? "image/png" : req.mimeType();
        if (!mime.startsWith("image/")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only images can be read");
        }
        String data = req.image().contains(",") ? req.image().substring(req.image().indexOf(',') + 1) : req.image();
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(data);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The image is not valid base64");
        }
        if (bytes.length > MAX_IMAGE_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Image is larger than 8 MB");
        }
        return receipts.read(
            bytes, mime, LocalDate.now(IST).toString(),
            req.categories() == null || req.categories().isEmpty() ? DEFAULT_CATEGORIES : req.categories());
    }

    /** @param image base64, with or without a "data:image/png;base64," prefix */
    public record ReceiptRequest(String image, String mimeType, List<String> categories) {}
}
