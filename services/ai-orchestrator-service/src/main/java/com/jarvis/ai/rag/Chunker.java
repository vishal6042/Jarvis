package com.jarvis.ai.rag;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Splits an extracted document into retrievable chunks.
 *
 * <p>The rules here were measured against the real corpus rather than assumed, and they differ per
 * document: SEBI's booklets carry lettered headings, the Home Maker module numbers them, and RBI's
 * FAME has no textual headings at all because each of its pages is one self-contained message. So a
 * document declares a strategy in the manifest, and an unstructured one falls back to its pages.
 *
 * <p>Chunks are hard-capped because the embedding model truncates past its window without
 * complaining -- an oversized chunk is not an error, it is a chunk that silently loses its tail.
 */
public final class Chunker {

    /** Accepts both "A. Title" and "1. Title": the two booklets number their sections differently. */
    private static final Pattern HEADING =
        Pattern.compile("^\\s*((?:[A-Z]|\\d{1,2})\\.)\\s+([A-Z][A-Za-z0-9 ,&/?'()’-]{3,70})\\s*$");
    private static final Pattern PAGE_NUMBER = Pattern.compile("^\\s*\\d{1,3}\\s*$");
    /** A Wingdings bullet extracts as a bare 'l'. */
    private static final Pattern WINGDINGS_BULLET = Pattern.compile("^(\\s*)l\\s+");
    /** RBI's font maps the rupee sign onto a backtick, so `10,000 means ₹10,000. */
    private static final Pattern BACKTICK_RUPEE = Pattern.compile("`\\s?(?=\\d)");
    private static final Pattern SENTENCE_END = Pattern.compile("(?<=[.!?])\\s+");
    /** Who a tax deduction is actually available to; the rest of the table is for companies. */
    private static final Pattern INDIVIDUAL =
        Pattern.compile("individual|HUF|all assessees|salaried|employee|pensioner", Pattern.CASE_INSENSITIVE);

    /** ~1800 chars is about 450 tokens, comfortably inside a 512-token embedding window. */
    static final int MAX_CHARS = 1800;
    /** Shorter than this and a chunk is a caption or a stray table cell, not an idea. */
    static final int MIN_CHARS = 120;
    /**
     * Below this many headings a document is not really structured by them. Set above the 5 that the
     * tax tables produce: too few headings spread one label across unrelated material, and a chunk
     * of claimable deductions labelled "Non-deductible items" is worse than one with no label.
     */
    private static final int MIN_SECTIONS = 8;

    /** A contents page: dotted leaders to a page number. Real prose never looks like this. */
    private static final Pattern TOC_LEADER = Pattern.compile("\\.{5,}\\s*\\d");
    /** These booklets embed self-assessment quizzes; an answer key is not guidance. */
    private static final Pattern QUIZ = Pattern.compile("correct answer\\s*[:\\-]", Pattern.CASE_INSENSITIVE);

    private Chunker() {
    }

    public record Chunk(String section, String text, String audience) {
    }

    public static List<Chunk> chunk(String raw, CorpusManifest.Document doc) {
        List<String> pages = clean(raw, doc.fixups());
        List<Section> sections = "page".equals(doc.strategy())
            ? pages.stream().filter(p -> !p.isBlank()).map(p -> new Section(null, p)).toList()
            : bySection(pages);

        List<Chunk> chunks = new ArrayList<>();
        for (Section section : sections) {
            for (String part : pack(units(section.body()))) {
                String text = part.strip();
                if (text.length() < MIN_CHARS || isNoise(text)) {
                    continue;
                }
                // The heading rides along on the chunk: it is the strongest retrieval signal it has.
                String body = section.title() == null ? text : section.title() + "\n\n" + text;
                chunks.add(new Chunk(section.title(), body, audienceOf(body, doc.audience())));
            }
        }
        return chunks;
    }

    /**
     * Drops chunks that are structure rather than content. Left in, a contents page becomes the top
     * hit for anything vaguely about planning, and a quiz answer key gets quoted back as guidance.
     */
    private static boolean isNoise(String text) {
        if (QUIZ.matcher(text).find()) {
            return true;
        }
        long leaders = TOC_LEADER.matcher(text).results().count();
        return leaders >= 2;
    }

    /**
     * A document declared "mixed" holds rows for several kinds of taxpayer. Classifying per chunk is
     * what stops a question about personal deductions retrieving one only a co-operative can claim.
     */
    private static String audienceOf(String text, String declared) {
        if (!"mixed".equals(declared)) {
            return declared;
        }
        return INDIVIDUAL.matcher(text).find() ? "individual" : "business";
    }

    private record Section(String title, String body) {
    }

    private static List<Section> bySection(List<String> pages) {
        String text = String.join("\n\n", pages);
        List<Section> sections = new ArrayList<>();
        String title = null;
        StringBuilder buffer = new StringBuilder();
        for (String line : text.split("\n", -1)) {
            Matcher m = HEADING.matcher(line);
            if (m.matches()) {
                if (!buffer.toString().isBlank()) {
                    sections.add(new Section(title, buffer.toString().strip()));
                }
                title = m.group(1) + " " + m.group(2).strip();
                buffer.setLength(0);
            } else {
                buffer.append(line).append('\n');
            }
        }
        if (!buffer.toString().isBlank()) {
            sections.add(new Section(title, buffer.toString().strip()));
        }
        // Too few real headings means this document is not organised by them after all.
        long named = sections.stream().filter(s -> s.title() != null).count();
        if (named < MIN_SECTIONS) {
            return pages.stream().filter(p -> !p.isBlank()).map(p -> new Section(null, p)).toList();
        }
        return sections;
    }

    /**
     * Strips the per-page furniture but keeps blank lines: after extraction they are the only
     * paragraph boundaries left, and the packer has nothing else to break on.
     */
    private static List<String> clean(String raw, List<String> fixups) {
        String[] rawPages = raw.split("\f", -1);
        String header = fixups.contains("strip-running-header") ? runningHeader(rawPages) : null;
        boolean rupee = fixups.contains("backtick-to-rupee");
        boolean bullets = fixups.contains("wingdings-bullet");

        List<String> pages = new ArrayList<>(rawPages.length);
        for (String page : rawPages) {
            List<String> kept = new ArrayList<>();
            for (String line : page.split("\n", -1)) {
                String trimmed = line.strip();
                if (PAGE_NUMBER.matcher(trimmed).matches() || (header != null && trimmed.equals(header))) {
                    continue;
                }
                if (trimmed.isEmpty()) {
                    if (!kept.isEmpty() && !kept.get(kept.size() - 1).isEmpty()) {
                        kept.add("");
                    }
                    continue;
                }
                String out = line.stripTrailing();
                if (bullets) {
                    out = WINGDINGS_BULLET.matcher(out).replaceAll("$1- ");
                }
                if (rupee) {
                    out = BACKTICK_RUPEE.matcher(out).replaceAll("₹");
                }
                kept.add(out);
            }
            pages.add(String.join("\n", kept).strip());
        }
        return pages;
    }

    /** The line repeating at the top of most pages is furniture, not content. */
    private static String runningHeader(String[] pages) {
        Map<String, Integer> firsts = new HashMap<>();
        for (String page : pages) {
            for (String line : page.split("\n", -1)) {
                if (!line.isBlank()) {
                    firsts.merge(line.strip(), 1, Integer::sum);
                    break;
                }
            }
        }
        return firsts.entrySet().stream()
            .max(Comparator.comparingInt(Map.Entry::getValue))
            .filter(e -> e.getValue() >= Math.max(3, pages.length * 0.3))
            .map(Map.Entry::getKey)
            .orElse(null);
    }

    private static List<String> units(String body) {
        List<String> units = new ArrayList<>();
        for (String paragraph : body.split("\n\\s*\n")) {
            if (!paragraph.isBlank()) {
                units.addAll(hardSplit(paragraph.strip()));
            }
        }
        return units;
    }

    /** Last resort for a paragraph longer than the cap on its own: break it on sentences. */
    private static List<String> hardSplit(String text) {
        if (text.length() <= MAX_CHARS) {
            return List.of(text);
        }
        return pack(List.of(SENTENCE_END.split(text)));
    }

    /** Greedily fills chunks from pre-split units, never exceeding the cap once a chunk has content. */
    private static List<String> pack(List<String> units) {
        List<String> packed = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (String unit : units) {
            if (current.length() > 0 && current.length() + 2 + unit.length() > MAX_CHARS) {
                packed.add(current.toString());
                current = new StringBuilder(unit);
            } else {
                if (current.length() > 0) {
                    current.append("\n\n");
                }
                current.append(unit);
            }
        }
        if (current.length() > 0) {
            packed.add(current.toString());
        }
        return packed;
    }
}
