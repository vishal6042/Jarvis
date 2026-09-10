package com.jarvis.ai.rag;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The chunking rules were derived by measuring the real corpus, and each one is here because
 * something in it broke without it. These tests pin that behaviour down.
 */
class ChunkerTest {

    private static CorpusManifest.Document doc(String strategy, String audience, String... fixups) {
        return new CorpusManifest.Document(
            "test-doc", "Test", "Publisher", "http://example.test",
            "IN", "education", audience, null, strategy, List.of(fixups), null);
    }

    private static String body(String text) {
        // Long enough to clear the minimum-length filter that drops captions and stray cells.
        return text + "\n\n" + "Padding sentence that carries this section past the minimum length. ".repeat(3);
    }

    @Test
    @DisplayName("splits on lettered and numbered headings alike")
    void splitsOnBothHeadingStyles() {
        String text = String.join("\n\n",
            "A. Financial Planning", body("Plan before you spend."),
            "B. Budgeting", body("Track what comes in and out."),
            "3. Savings and Investments", body("Saving differs from investing."),
            "D. Returns", body("Returns come as income or growth."),
            "E. Risk", body("Higher return carries higher risk."),
            "F. Insurance", body("Cover what you cannot afford to lose."),
            "G. Retirement", body("Start early."),
            "H. Grievances", body("Escalate to the ombudsman."));

        List<Chunker.Chunk> chunks = Chunker.chunk(text, doc("heading", "individual"));

        assertThat(chunks).isNotEmpty();
        assertThat(chunks).extracting(Chunker.Chunk::section)
            .contains("A. Financial Planning", "B. Budgeting", "3. Savings and Investments");
        // The heading rides on the text, since it is the strongest retrieval signal a chunk has.
        assertThat(chunks.get(0).text()).startsWith("A. Financial Planning");
    }

    @Test
    @DisplayName("falls back to pages when a document has too few headings to be structured by them")
    void fallsBackToPagesWhenHeadingsAreSparse() {
        // Two headings across the document: one label would otherwise span unrelated material,
        // which is how claimable deductions ended up labelled "Non-deductible items".
        String text = "A. Deductible items\n" + body("80C covers life insurance premium.")
            + "\f" + body("80D covers medical insurance premium.")
            + "\f" + "B. Non-deductible items\n" + body("Personal expenses are not deductible.");

        List<Chunker.Chunk> chunks = Chunker.chunk(text, doc("heading", "individual"));

        assertThat(chunks).isNotEmpty();
        assertThat(chunks).extracting(Chunker.Chunk::section).containsOnlyNulls();
    }

    @Test
    @DisplayName("repairs RBI's backtick rupee sign and Wingdings bullets")
    void appliesFixups() {
        String text = body("`10,000 earning interest becomes `26,851.") + "\nl Borrow within your means";

        List<Chunker.Chunk> chunks =
            Chunker.chunk(text, doc("page", "individual", "backtick-to-rupee", "wingdings-bullet"));

        String all = chunks.stream().map(Chunker.Chunk::text).reduce("", String::concat);
        assertThat(all).contains("₹10,000", "₹26,851").doesNotContain("`10,000");
        assertThat(all).contains("- Borrow within your means");
    }

    @Test
    @DisplayName("strips the header repeating on every page")
    void stripsRunningHeader() {
        String page = "Financial Education Booklet\n" + body("Real content here.");
        String text = String.join("\f", page, page, page, page);

        List<Chunker.Chunk> chunks = Chunker.chunk(text, doc("page", "individual", "strip-running-header"));

        assertThat(chunks).isNotEmpty();
        assertThat(chunks).noneMatch(c -> c.text().contains("Financial Education Booklet"));
        assertThat(chunks.get(0).text()).contains("Real content here.");
    }

    @Test
    @DisplayName("drops contents pages and quiz answer keys")
    void dropsStructuralNoise() {
        String toc = "CHAPTER 1 - PLANNING.................5\nCHAPTER 2 - SAVING..................12\n"
            + "CHAPTER 3 - INVESTING...............20\n" + body("More contents.");
        String quiz = body("Which section allows the deduction? (a) 80C (b) 80D") + "\nCorrect answer: (b)";

        assertThat(Chunker.chunk(toc, doc("page", "individual"))).isEmpty();
        assertThat(Chunker.chunk(quiz, doc("page", "individual"))).isEmpty();
    }

    @Test
    @DisplayName("classifies audience per chunk for documents serving several kinds of taxpayer")
    void classifiesAudienceForMixedDocuments() {
        String individual = body("80C deduction available to an individual or HUF.");
        String business = body("Deduction for expenditure on prospecting for minerals.");

        List<Chunker.Chunk> chunks =
            Chunker.chunk(individual + "\f" + business, doc("page", "mixed"));

        assertThat(chunks).hasSize(2);
        assertThat(chunks.get(0).audience()).isEqualTo("individual");
        assertThat(chunks.get(1).audience()).isEqualTo("business");
    }

    @Test
    @DisplayName("never emits a chunk past the embedding window")
    void respectsTheEmbeddingWindow() {
        String longParagraph = "This sentence describes a financial planning principle in detail. ".repeat(120);

        List<Chunker.Chunk> chunks = Chunker.chunk(longParagraph, doc("page", "individual"));

        assertThat(chunks).isNotEmpty();
        // A single over-long sentence can still overshoot slightly; the guard is that nothing
        // approaches the 512-token limit where the model would truncate silently.
        assertThat(chunks).allMatch(c -> c.text().length() <= Chunker.MAX_CHARS + 200);
    }
}
