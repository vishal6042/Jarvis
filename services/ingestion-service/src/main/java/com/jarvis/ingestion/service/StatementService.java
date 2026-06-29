package com.jarvis.ingestion.service;

import com.jarvis.ingestion.client.AiClient;
import com.jarvis.ingestion.client.ExpenseClient;
import com.jarvis.ingestion.domain.MessageSource;
import com.jarvis.ingestion.domain.ParseStatus;
import com.jarvis.ingestion.domain.RawMessage;
import com.jarvis.ingestion.repo.RawMessageRepository;
import com.jarvis.ingestion.web.dto.StatementImportResult;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/**
 * Statement import: extract text from a PDF/CSV, have the AI identify the account + all
 * transactions, resolve (or auto-create) that account in expense-service, and persist each row
 * (deduped). Bank-agnostic — no per-bank parsing.
 */
@Service
public class StatementService {

    private static final Logger log = LoggerFactory.getLogger(StatementService.class);
    private static final int CHUNK_CHARS = 6000;

    private final AiClient ai;
    private final ExpenseClient expense;
    private final RawMessageRepository rawMessages;

    public StatementService(AiClient ai, ExpenseClient expense, RawMessageRepository rawMessages) {
        this.ai = ai;
        this.expense = expense;
        this.rawMessages = rawMessages;
    }

    public StatementImportResult importStatement(MultipartFile file) {
        String fileName = file.getOriginalFilename() == null ? "statement" : file.getOriginalFilename();
        String text = extractText(file, fileName);

        // Scan each chunk; take account identity from the first chunk that has it, txns from all.
        String bank = null, last4 = null, accountType = null;
        List<AiClient.ParsedTransaction> rows = new ArrayList<>();
        for (String chunk : chunk(text)) {
            AiClient.StatementResult r = ai.parseStatement(chunk);
            if (r == null) continue;
            if (last4 == null && r.last4() != null && !r.last4().isBlank()) {
                last4 = r.last4().trim();
                bank = r.bank();
                accountType = r.accountType();
            }
            if (r.transactions() != null) rows.addAll(r.transactions());
        }

        // Resolve (or auto-create) the account this statement belongs to.
        Long accountId = null;
        String accountName = null;
        if (last4 != null && !last4.isBlank()) {
            ExpenseClient.ResolvedAccount acc = expense.resolveAccount(bank, last4, accountType);
            if (acc != null) {
                accountId = acc.id();
                accountName = acc.displayName();
            }
        }

        int imported = 0, duplicates = 0, skipped = 0;
        for (AiClient.ParsedTransaction p : rows) {
            BigDecimal amount = parseAmount(p.amount());
            String direction = parseDirection(p.direction());
            if (amount == null || direction == null) {
                skipped++;
                continue;
            }
            var req = new ExpenseClient.CreateTransactionRequest(
                accountId,
                blankToNull(p.last4()),
                amount,
                p.currency() == null || p.currency().isBlank() ? "INR" : p.currency(),
                direction,
                p.merchant(),
                p.category() == null || p.category().isBlank() ? "Uncategorized" : p.category().trim(),
                resolveDate(p.occurredOn()),
                MessageSource.STATEMENT.name(),
                "stmt:" + fileName);
            if (expense.create(req).created()) imported++;
            else duplicates++;
        }

        // Audit row for the upload.
        RawMessage msg = new RawMessage();
        msg.setSource(MessageSource.STATEMENT);
        msg.setPayload(fileName);
        msg.setSender(accountName);
        msg.setStatus(ParseStatus.PARSED);
        rawMessages.save(msg);

        log.info("Imported statement '{}' → account {} : {} new, {} dup, {} skipped",
            fileName, accountName, imported, duplicates, skipped);
        return new StatementImportResult(
            fileName, accountName, bank, last4, rows.size(), imported, duplicates, skipped);
    }

    private String extractText(MultipartFile file, String fileName) {
        try {
            boolean pdf = fileName.toLowerCase().endsWith(".pdf")
                || "application/pdf".equalsIgnoreCase(file.getContentType());
            if (pdf) {
                try (PDDocument doc = Loader.loadPDF(file.getBytes())) {
                    return new PDFTextStripper().getText(doc);
                }
            }
            return new String(file.getBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to read statement file", e);
        }
    }

    /** Split into ~CHUNK_CHARS chunks on line boundaries so each fits the model's context. */
    private List<String> chunk(String text) {
        List<String> chunks = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        for (String line : text.split("\\r?\\n")) {
            if (cur.length() + line.length() + 1 > CHUNK_CHARS && cur.length() > 0) {
                chunks.add(cur.toString());
                cur.setLength(0);
            }
            cur.append(line).append('\n');
        }
        if (cur.length() > 0) chunks.add(cur.toString());
        return chunks.isEmpty() ? List.of(text) : chunks;
    }

    private String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private BigDecimal parseAmount(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            String cleaned = raw.replaceAll("[^0-9.]", "");
            return cleaned.isEmpty() ? null : new BigDecimal(cleaned);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String parseDirection(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String v = raw.trim().toUpperCase();
        if (v.startsWith("DEBIT") || v.equals("DR") || v.equals("OUT")) return "DEBIT";
        if (v.startsWith("CREDIT") || v.equals("CR") || v.equals("IN")) return "CREDIT";
        return null;
    }

    private Instant resolveDate(String occurredOn) {
        if (occurredOn == null || occurredOn.isBlank()) return Instant.now();
        try {
            return LocalDate.parse(occurredOn.trim()).atStartOfDay(ZoneOffset.UTC).toInstant();
        } catch (Exception e) {
            return Instant.now();
        }
    }
}
