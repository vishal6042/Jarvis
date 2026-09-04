import { Fragment, type ReactNode } from "react";

/**
 * Tiny dependency-free Markdown renderer for the assistant's replies. Handles the subset the model
 * emits — **bold**, *italic*, `code`, bullet/numbered lists, headings and paragraphs — so a reply
 * like "- **Earnings:** ₹3,81,310" renders as a real bulleted, bold-labelled list instead of raw
 * asterisks. (Not a full Markdown engine; we don't need one for this local single-user app.)
 */
function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (/^\*[^*]+\*$/.test(part)) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (/^`[^`]+`$/.test(part)) {
      return (
        <code key={i} className="rounded bg-background/80 px-1 py-0.5 font-mono text-[0.85em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export default function Markdown({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      blocks.push(
        <p key={`b${blocks.length}`} className="leading-relaxed">
          {renderInline(para.join(" "))}
        </p>
      );
      para = [];
    }
  };
  const flushList = () => {
    if (!list) return;
    const { ordered, items } = list;
    blocks.push(
      ordered ? (
        <ol key={`b${blocks.length}`} className="list-decimal space-y-1 pl-5">
          {items.map((it, i) => (
            <li key={i}>{renderInline(it)}</li>
          ))}
        </ol>
      ) : (
        <ul key={`b${blocks.length}`} className="space-y-1.5">
          {items.map((it, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-[0.5rem] size-1.5 shrink-0 rounded-full bg-primary/70" />
              <span>{renderInline(it)}</span>
            </li>
          ))}
        </ul>
      )
    );
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    const bullet = line.match(/^[-*]\s+(.*)$/);
    const ordered = line.match(/^\d+\.\s+(.*)$/);
    if (heading) {
      flushPara();
      flushList();
      blocks.push(
        <p key={`b${blocks.length}`} className="pt-1 font-semibold text-foreground">
          {renderInline(heading[1])}
        </p>
      );
    } else if (bullet) {
      flushPara();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1]);
    } else if (ordered) {
      flushPara();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(ordered[1]);
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();

  return <div className="space-y-2">{blocks}</div>;
}
