package com.jarvis.sync.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.Text
import com.jarvis.sync.ui.theme.Ink

/**
 * Just enough Markdown for what the assistant writes.
 *
 * <p>The agent answers in Markdown — bold figures, a dash list of categories, the odd heading — and
 * the phone was printing the asterisks and dashes as characters. This renders the handful of marks
 * it actually uses rather than adding a Markdown library and its transitive weight for four
 * constructs. Anything it does not understand is left as plain text, which is the honest failure
 * mode: a stray asterisk is a blemish, a swallowed sentence is a bug.
 */
@Composable
fun MarkdownText(
    text: String,
    modifier: Modifier = Modifier,
    color: Color = Ink.text,
    fontSize: TextUnit = 14.5.sp,
    lineHeight: TextUnit = 22.sp,
) {
    val blocks = remember(text) { parseBlocks(text) }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        blocks.forEach { block ->
            when (block) {
                is Block.Heading -> Text(
                    inline(block.text),
                    color = color,
                    fontSize = fontSize * 1.08f,
                    fontWeight = FontWeight.Bold,
                    lineHeight = lineHeight,
                )
                is Block.Paragraph -> Text(
                    inline(block.text),
                    color = color,
                    fontSize = fontSize,
                    lineHeight = lineHeight,
                )
                is Block.Item -> Row(Modifier.fillMaxWidth()) {
                    Text(
                        block.marker,
                        color = Ink.dim,
                        fontSize = fontSize,
                        lineHeight = lineHeight,
                        modifier = Modifier.width(if (block.marker.length > 2) 26.dp else 16.dp),
                    )
                    Text(
                        inline(block.text),
                        color = color,
                        fontSize = fontSize,
                        lineHeight = lineHeight,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

private sealed interface Block {
    data class Heading(val text: String) : Block
    data class Paragraph(val text: String) : Block
    /** A list row: the bullet or number, and what follows it. */
    data class Item(val marker: String, val text: String) : Block
}

private val HEADING = Regex("""^\s{0,3}#{1,6}\s+(.*)$""")
private val BULLET = Regex("""^\s*[-*•]\s+(.*)$""")
private val NUMBERED = Regex("""^\s*(\d{1,2})[.)]\s+(.*)$""")

/**
 * Split into blocks. Consecutive plain lines join into one paragraph — the model wraps its prose,
 * and rendering each wrapped line as its own paragraph would double every gap.
 */
private fun parseBlocks(text: String): List<Block> {
    val out = mutableListOf<Block>()
    val paragraph = StringBuilder()

    fun flush() {
        if (paragraph.isNotEmpty()) {
            out += Block.Paragraph(paragraph.toString().trim())
            paragraph.clear()
        }
    }

    text.replace("\r\n", "\n").split('\n').forEach { raw ->
        val line = raw.trimEnd()
        when {
            line.isBlank() -> flush()
            HEADING.matches(line) -> {
                flush()
                out += Block.Heading(HEADING.find(line)!!.groupValues[1].trim())
            }
            NUMBERED.matches(line) -> {
                flush()
                val m = NUMBERED.find(line)!!
                out += Block.Item(m.groupValues[1] + ".", m.groupValues[2].trim())
            }
            BULLET.matches(line) -> {
                flush()
                out += Block.Item("•", BULLET.find(line)!!.groupValues[1].trim())
            }
            else -> {
                if (paragraph.isNotEmpty()) paragraph.append(' ')
                paragraph.append(line.trim())
            }
        }
    }
    flush()
    return out
}

/**
 * Bold, italic and code inside a line. One left-to-right pass: a marker only opens a span when its
 * partner exists later on the line, so an asterisk used as an asterisk stays one.
 */
private fun inline(text: String): AnnotatedString = buildAnnotatedString {
    var i = 0
    while (i < text.length) {
        val rest = text.substring(i)
        val bold = openerAt(rest, "**") ?: openerAt(rest, "__")
        val code = openerAt(rest, "`")
        val italic = if (bold == null) openerAt(rest, "*") ?: openerAt(rest, "_") else null

        when {
            bold != null -> {
                withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = Ink.text)) { append(bold.inner) }
                i += bold.consumed
            }
            code != null -> {
                withStyle(SpanStyle(fontFamily = FontFamily.Monospace, color = Ink.accentSoft)) { append(code.inner) }
                i += code.consumed
            }
            italic != null -> {
                withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(italic.inner) }
                i += italic.consumed
            }
            else -> {
                append(text[i])
                i++
            }
        }
    }
}

private data class Span(val inner: String, val consumed: Int)

/** A marker at position 0 of [rest] with a closing partner and something between them. */
private fun openerAt(rest: String, mark: String): Span? {
    if (!rest.startsWith(mark)) return null
    val close = rest.indexOf(mark, startIndex = mark.length)
    if (close <= mark.length) return null
    return Span(rest.substring(mark.length, close), close + mark.length)
}
