import { escapeHtml } from "./html.js";

function safeHref(value: string): string | null {
  const trimmed = value.trim();
  if (!/^(?:https?:|mailto:)/iu.test(trimmed)) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" ||
      parsed.protocol === "https:" ||
      parsed.protocol === "mailto:"
      ? trimmed
      : null;
  } catch {
    return null;
  }
}

function findClosing(value: string, start: number, marker: string): number {
  return value.indexOf(marker, start + marker.length);
}

/**
 * Small, allow-list Markdown renderer for stored Tutor text. Input is escaped
 * at every text boundary; raw HTML and unsafe URL schemes are never emitted.
 */
export function renderInlineMarkdown(value: string): string {
  let output = "";
  let index = 0;
  while (index < value.length) {
    if (value[index] === "`" && value[index + 1] !== "`") {
      const end = findClosing(value, index, "`");
      if (end > index + 1) {
        output += `<code>${escapeHtml(value.slice(index + 1, end))}</code>`;
        index = end + 1;
        continue;
      }
    }

    const strongMarker = value.startsWith("**", index)
      ? "**"
      : value.startsWith("__", index)
        ? "__"
        : null;
    if (strongMarker !== null) {
      const end = findClosing(value, index, strongMarker);
      if (end > index + strongMarker.length) {
        output += `<strong>${renderInlineMarkdown(
          value.slice(index + strongMarker.length, end),
        )}</strong>`;
        index = end + strongMarker.length;
        continue;
      }
    }

    const emphasisMarker = value[index] === "*" || value[index] === "_"
      ? value[index] as string
      : null;
    if (
      emphasisMarker !== null &&
      value[index + 1] !== emphasisMarker
    ) {
      const end = findClosing(value, index, emphasisMarker);
      if (end > index + 1) {
        output += `<em>${renderInlineMarkdown(
          value.slice(index + 1, end),
        )}</em>`;
        index = end + 1;
        continue;
      }
    }

    if (value[index] === "[") {
      const labelEnd = value.indexOf("](", index + 1);
      const hrefEnd = labelEnd === -1 ? -1 : value.indexOf(")", labelEnd + 2);
      if (labelEnd > index + 1 && hrefEnd > labelEnd + 2) {
        const href = safeHref(value.slice(labelEnd + 2, hrefEnd));
        if (href !== null) {
          output += `<a href="${escapeHtml(href)}" rel="noreferrer">${renderInlineMarkdown(
            value.slice(index + 1, labelEnd),
          )}</a>`;
          index = hrefEnd + 1;
          continue;
        }
      }
    }

    if (value[index] === "\n") {
      output += "<br>\n";
      index += 1;
      continue;
    }

    const nextSpecial = value.slice(index + 1).search(/(?:\\|`|\*|_|\[|\]|\n)/u);
    const end = nextSpecial === -1 ? value.length : index + 1 + nextSpecial;
    output += escapeHtml(value.slice(index, end));
    index = end;
  }
  return output;
}

function renderCodeBlock(language: string, lines: readonly string[]): string {
  return `<pre class="markdown-code-block"><code data-language="${escapeHtml(
    language || "text",
  )}">${escapeHtml(lines.join("\n"))}</code></pre>`;
}

function isUnorderedListLine(line: string): boolean {
  return /^\s*[-*+]\s+/.test(line);
}

function isOrderedListLine(line: string): boolean {
  return /^\s*\d+[.)]\s+/.test(line);
}

function renderList(
  lines: readonly string[],
  ordered: boolean,
): string {
  const items = lines.map((line) => line.replace(
    ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/,
    "",
  ));
  const tag = ordered ? "ol" : "ul";
  return `<${tag}>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</${tag}>`;
}

/** Renders the safe subset used for Tutor responses in audit pages. */
export function renderTutorMarkdown(value: string): string {
  const lines = value.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  const blocks: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim().length === 0) {
      index += 1;
      continue;
    }

    if (line.trim().startsWith("```")) {
      const language = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").trim().startsWith("```")) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push(renderCodeBlock(language, codeLines));
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading !== null) {
      const level = heading[1]?.length ?? 1;
      blocks.push(`<h${level}>${renderInlineMarkdown(heading[2] ?? "")}</h${level}>`);
      index += 1;
      continue;
    }

    if (isUnorderedListLine(line) || isOrderedListLine(line)) {
      const ordered = isOrderedListLine(line);
      const listLines: string[] = [];
      while (index < lines.length) {
        const candidate = lines[index] ?? "";
        if ((ordered && !isOrderedListLine(candidate)) ||
          (!ordered && !isUnorderedListLine(candidate))) {
          break;
        }
        listLines.push(candidate);
        index += 1;
      }
      blocks.push(renderList(listLines, ordered));
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const candidate = lines[index] ?? "";
      if (
        candidate.trim().length === 0 ||
        candidate.trim().startsWith("```") ||
        /^(#{1,6})\s+/.test(candidate) ||
        isUnorderedListLine(candidate) ||
        isOrderedListLine(candidate)
      ) {
        break;
      }
      paragraphLines.push(candidate);
      index += 1;
    }
    blocks.push(`<p>${renderInlineMarkdown(paragraphLines.join("\n"))}</p>`);
  }
  return blocks.join("\n");
}
