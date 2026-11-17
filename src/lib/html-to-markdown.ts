/**
 * Minimal HTML → Markdown serializer for inline (WYSIWYG) editing.
 *
 * It only has to handle the HTML that `marked` produces from this site's
 * posts (plus whatever a contenteditable edit can introduce: <b>, <i>,
 * <div>, <span>, <br>…). Anything unrecognised is unwrapped to its text /
 * children rather than dropped, so editing can never silently delete copy.
 */

const clean = (s: string) => s.replace(/\s+/g, " ");

export function serializeInline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return clean(node.textContent ?? "");
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  const inner = () => [...el.childNodes].map(serializeInline).join("");
  switch (el.tagName) {
    case "BR":
      return "\n";
    case "STRONG":
    case "B": {
      const t = inner().trim();
      return t ? `**${t}**` : "";
    }
    case "EM":
    case "I": {
      const t = inner().trim();
      return t ? `*${t}*` : "";
    }
    case "DEL":
    case "S": {
      const t = inner().trim();
      return t ? `~~${t}~~` : "";
    }
    case "CODE": {
      const t = el.textContent ?? "";
      return t.includes("`") ? `\`\`${t}\`\`` : `\`${t}\``;
    }
    case "A": {
      const href = el.getAttribute("href") ?? "";
      const t = inner().trim() || href;
      return href ? `[${t}](${href})` : t;
    }
    case "IMG":
      return `![${el.getAttribute("alt") ?? ""}](${el.getAttribute("src") ?? ""})`;
    default:
      return inner();
  }
}

const inlineText = (el: HTMLElement) => serializeInline(el).trim();

function serializeList(list: HTMLElement, depth: number): string {
  const ordered = list.tagName === "OL";
  const start = Number(list.getAttribute("start") ?? "1") || 1;
  const pad = "  ".repeat(depth);
  const lines: string[] = [];
  [...list.children].forEach((li, i) => {
    if (li.tagName !== "LI") return;
    const nested = [...li.children].filter((c) => c.tagName === "UL" || c.tagName === "OL");
    const clone = li.cloneNode(true) as HTMLElement;
    [...clone.children]
      .filter((c) => c.tagName === "UL" || c.tagName === "OL")
      .forEach((c) => c.remove());
    lines.push(`${pad}${ordered ? `${start + i}.` : "-"} ${inlineText(clone)}`);
    nested.forEach((n) => lines.push(serializeList(n as HTMLElement, depth + 1)));
  });
  return lines.join("\n");
}

function serializeTable(table: HTMLElement): string {
  const rows = [...table.querySelectorAll("tr")].map((tr) =>
    [...tr.querySelectorAll("th,td")].map((c) => inlineText(c as HTMLElement).replace(/\|/g, "\\|"))
  );
  if (!rows.length) return "";
  const [head, ...body] = rows;
  const sep = head.map(() => "---");
  return [head, sep, ...body].map((r) => `| ${r.join(" | ")} |`).join("\n");
}

function serializeFigure(figure: HTMLElement): string {
  const cls = figure.getAttribute("class");
  // The interactive portfolio figures (episode/excavator/splat) are Svelte
  // components, not markdown — they never occur inside .prose, so a figure
  // here is raw HTML from the .md file and is rebuilt as raw HTML.
  if (figure.querySelector("[data-inline-figure]")) return "";
  const video = figure.querySelector("video");
  const img = figure.querySelector("img");
  const caption = figure.querySelector("figcaption");
  const parts: string[] = [cls ? `<figure class="${cls}">` : "<figure>"];
  if (video) {
    const attrs: string[] = [];
    if (video.hasAttribute("controls")) attrs.push("controls");
    if (video.hasAttribute("playsinline")) attrs.push("playsinline");
    const preload = video.getAttribute("preload");
    if (preload) attrs.push(`preload="${preload}"`);
    const src = video.getAttribute("src");
    if (src) attrs.push(`src="${src}"`);
    parts.push(`<video ${attrs.join(" ")}>${(video.textContent ?? "").trim()}</video>`);
  } else if (img) {
    parts.push(`<img src="${img.getAttribute("src") ?? ""}" alt="${img.getAttribute("alt") ?? ""}">`);
  }
  if (caption) parts.push(`<figcaption>${inlineText(caption)}</figcaption>`);
  parts.push("</figure>");
  return parts.join("\n");
}

/** Serialize one top-level block element to a markdown block (no trailing blank line). */
export function serializeBlock(el: HTMLElement): string {
  switch (el.tagName) {
    case "H1": return `# ${inlineText(el)}`;
    case "H2": return `## ${inlineText(el)}`;
    case "H3": return `### ${inlineText(el)}`;
    case "H4": return `#### ${inlineText(el)}`;
    case "H5": return `##### ${inlineText(el)}`;
    case "H6": return `###### ${inlineText(el)}`;
    case "P": return inlineText(el);
    case "HR": return "---";
    case "UL":
    case "OL": return serializeList(el, 0);
    case "BLOCKQUOTE":
      return [...el.children]
        .map((c) => serializeBlock(c as HTMLElement))
        .join("\n\n")
        .split("\n")
        .map((l) => (l ? `> ${l}` : ">"))
        .join("\n");
    case "PRE": {
      const code = el.querySelector("code");
      const text = (code ?? el).textContent?.replace(/\n$/, "") ?? "";
      const lang = /language-(\S+)/.exec(code?.getAttribute("class") ?? "")?.[1] ?? "";
      return `\`\`\`${lang}\n${text}\n\`\`\``;
    }
    case "TABLE": return serializeTable(el);
    case "FIGURE": return serializeFigure(el);
    case "DIV":
      return [...el.children].map((c) => serializeBlock(c as HTMLElement)).filter(Boolean).join("\n\n") || inlineText(el);
    default:
      return inlineText(el);
  }
}
