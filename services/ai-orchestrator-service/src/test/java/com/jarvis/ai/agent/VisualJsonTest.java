package com.jarvis.ai.agent;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The web app draws these by field name, and a renamed or missing key fails silently as a blank
 * card rather than as an error anyone would notice. {@code of} is the one to watch: it is a record
 * component sitting next to static factories of the same name.
 */
class VisualJsonTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Test
    @DisplayName("a visual serialises to exactly the keys the web app reads")
    void keysAreStable() throws Exception {
        Visual visual = new Visual(
            Visual.SERIES, "Spend by day", "the whole household together · this month so far",
            new BigDecimal("1141.82"), "12 days with spending",
            List.of(Visual.Point.of("Fri 11 Sep", new BigDecimal("633"), "2 purchases")));

        JsonNode node = JSON.readTree(JSON.writeValueAsString(visual));

        assertThat(node.fieldNames()).toIterable()
            .containsExactlyInAnyOrder("kind", "title", "subtitle", "amount", "caption", "points");
        assertThat(node.get("kind").asText()).isEqualTo("series");
        assertThat(node.get("amount").decimalValue()).isEqualByComparingTo("1141.82");

        JsonNode point = node.get("points").get(0);
        assertThat(point.fieldNames()).toIterable()
            .containsExactlyInAnyOrder("label", "value", "of", "note");
        assertThat(point.get("label").asText()).isEqualTo("Fri 11 Sep");
        assertThat(point.get("value").decimalValue()).isEqualByComparingTo("633");
        assertThat(point.get("of").isNull()).isTrue();
        assertThat(point.get("note").asText()).isEqualTo("2 purchases");
    }

    @Test
    @DisplayName("a goal carries what it is out of, so the bar has something to fill against")
    void progressCarriesItsTarget() throws Exception {
        Visual visual = new Visual(
            Visual.PROGRESS, "Goals", "Neha Rani (Spouse)", null, null,
            List.of(new Visual.Point(
                "Emergency fund", new BigDecimal("340000"), new BigDecimal("600000"), "by 2027-03-31")));

        JsonNode point = JSON.readTree(JSON.writeValueAsString(visual)).get("points").get(0);

        assertThat(point.get("value").decimalValue()).isEqualByComparingTo("340000");
        assertThat(point.get("of").decimalValue()).isEqualByComparingTo("600000");
    }
}
