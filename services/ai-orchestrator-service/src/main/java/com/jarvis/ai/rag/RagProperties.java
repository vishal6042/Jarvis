package com.jarvis.ai.rag;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "jarvis.rag")
public class RagProperties {

    /** Whether the assistant may search the guidance corpus at all. */
    private boolean enabled = true;
    /** Re-embed and upsert the corpus at startup. Off by default: indexing is a deliberate act. */
    private boolean indexOnStart = false;
    private String corpusDir = "../../corpus";
    private int topK = 4;
    private double minScore = 0.45;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public boolean isIndexOnStart() {
        return indexOnStart;
    }

    public void setIndexOnStart(boolean indexOnStart) {
        this.indexOnStart = indexOnStart;
    }

    public String getCorpusDir() {
        return corpusDir;
    }

    public void setCorpusDir(String corpusDir) {
        this.corpusDir = corpusDir;
    }

    public int getTopK() {
        return topK;
    }

    public void setTopK(int topK) {
        this.topK = topK;
    }

    public double getMinScore() {
        return minScore;
    }

    public void setMinScore(double minScore) {
        this.minScore = minScore;
    }
}
