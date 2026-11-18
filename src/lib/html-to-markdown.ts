/**
 * Minimal HTML → Markdown serializer for inline (WYSIWYG) editing.
 *
 * It only has to handle the HTML that `marked` produces from this site's
 * posts (plus whatever a contenteditable edit can introduce: <b>, <i>,
 * <span style="font-weight: bold">, <div>, <br>…). Anything unrecognised is
 * unwrapped to its text / children rather than dropped, so editing can never
 * silently delete copy.
 *
 * Bold / italic are tracked as a style stack instead of wrapping each tag's
 * trimmed text. That keeps spaces outside the markers (so `**word **` doesn't
 * fail to parse and a double-clicked word doesn't glue to the next one) and
 * still recognizes the span-with-inline-style markup some browsers emit.
 */

type Marks = { strike: boolean; bold: boolean; italic: boolean };
type Seg = { text: string; marks: Marks };

const EMPTY: Marks = { strike: false, bold: false, italic: false };

const sameMarks = (a: Marks, b: Marks) =>
  a.strike === b.strike && a.bold === b.bold && a.italic === b.italic;

const weightBold = (fw: string) => {
  if (fw === "bold" || fw === "bolder") return true;
  const n = Number(fw);
  return Number.isFinite(n) && n >= 600;
};

const weightOff = (fw: string) => fw === "normal" || fw === "400" || fw === "lighter";

function marksFrom(el: HTMLElement, parent: Marks): Marks {
  const marks = { ...parent };
  const weight = el.style.fontWeight;
  const style = el.style.fontStyle;
  const tag = el.tagName;
  if (tag === "STRONG" || tag === "B" || weightBold(weight)) marks.bold = true;
  if (weightOff(weight)) marks.bold = false;
  if (tag === "EM" || tag === "I" || style === "italic" || style === "oblique") marks.italic = true;
  if (style === "normal") marks.italic = false;
  if (tag === "DEL" || tag === "S" || tag === "STRIKE") marks.strike = true;
  return marks;
}

function pushSeg(segs: Seg[], raw: string, marks: Marks) {
  const text = raw.replace(/\u200B/g, "").replace(/[^\S\n]+/g, " ");
  if (!text) return;
  const prev = segs[segs.length - 1];
  if (prev && sameMarks(prev.marks, marks)) {
    prev.text += text;
    prev.text = prev.text.replace(/[^\S\n]{2,}/g, " ");
  } else {
    segs.push({ text, marks: { ...marks } });
  }
}

const intersect = (a: Marks, b: Marks): Marks => ({
  strike: a.strike && b.strike,
  bold: a.bold && b.bold,
  italic: a.italic && b.italic
});

/**
 * A space sitting against a marker breaks CommonMark (`**hello **`).
 * Peel only the spaces next to a mark that is about to turn on or off,
 * and leave a space inside marks that stay on (`**hello *world***`).
 */
function peelEdgeSpaces(segs: Seg[]): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < segs.length; i++) {
    const marks = segs[i].marks;
    let text = segs[i].text;
    const prev = i > 0 ? segs[i - 1].marks : EMPTY;
    const next = i + 1 < segs.length ? segs[i + 1].marks : EMPTY;
    const lead = /^[ ]+/.exec(text)?.[0] ?? "";
    if (lead && lead.length === text.length) {
      pushSeg(out, text, intersect(prev, next));
      continue;
    }
    if (lead) {
      pushSeg(out, lead, intersect(prev, marks));
      text = text.slice(lead.length);
    }
    const trail = /[ ]+$/.exec(text)?.[0] ?? "";
    if (trail && trail.length < text.length) {
      pushSeg(out, text.slice(0, text.length - trail.length), marks);
      pushSeg(out, trail, intersect(marks, next));
    } else if (text) {
      pushSeg(out, text, marks);
    }
  }
  return out;
}

function renderSegs(segs: Seg[]): string {
  let out = "";
  let cur: Marks = { ...EMPTY };
  const close = (from: Marks, to: Marks) => {
    if (from.italic && !to.italic) out += "*";
    if (from.bold && !to.bold) out += "**";
    if (from.strike && !to.strike) out += "~~";
  };
  const open = (from: Marks, to: Marks) => {
    if (!from.strike && to.strike) out += "~~";
    if (!from.bold && to.bold) out += "**";
    if (!from.italic && to.italic) out += "*";
  };
  for (const seg of segs) {
    close(cur, seg.marks);
    open(cur, seg.marks);
    out += seg.text;
    cur = seg.marks;
  }
  close(cur, EMPTY);
  return out;
}

function collect(nodes: Iterable<Node>, marks: Marks, segs: Seg[]) {
  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      pushSeg(segs, node.textContent ?? "", marks);
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as HTMLElement;
    if (el.tagName === "BR") {
      pushSeg(segs, "\n", marks);
      continue;
    }
    if (el.tagName === "IMG") {
      pushSeg(segs, `![${el.getAttribute("alt") ?? ""}](${el.getAttribute("src") ?? ""})`, marks);
      continue;
    }
    if (el.tagName === "CODE") {
      const t = (el.textContent ?? "").replace(/\u200B/g, "");
      pushSeg(segs, t.includes("`") ? `\`\`${t}\`\`` : `\`${t}\``, marks);
      continue;
    }
    if (el.tagName === "A") {
      const href = el.getAttribute("href") ?? "";
      const inner: Seg[] = [];
      collect(el.childNodes, EMPTY, inner);
      const label = renderSegs(peelEdgeSpaces(inner)).trim() || href;
      pushSeg(segs, href ? `[${label}](${href})` : label, marks);
      continue;
    }
    collect(el.childNodes, marksFrom(el, marks), segs);
  }
}

function renderNodes(nodes: Iterable<Node>, marks: Marks): string {
  const segs: Seg[] = [];
  collect(nodes, marks, segs);
  return renderSegs(peelEdgeSpaces(segs));
}

export function serializeInline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? "").replace(/\u200B/g, "").replace(/[^\S\n]+/g, " ");
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  if (el.tagName === "BR") return "\n";
  if (el.tagName === "IMG") return `![${el.getAttribute("alt") ?? ""}](${el.getAttribute("src") ?? ""})`;
  if (el.tagName === "CODE") {
    const t = el.textContent ?? "";
    return t.includes("`") ? `\`\`${t}\`\`` : `\`${t}\``;
  }
  if (el.tagName === "A") {
    const href = el.getAttribute("href") ?? "";
    const label = renderNodes(el.childNodes, EMPTY).trim() || href;
    return href ? `[${label}](${href})` : label;
  }
  return renderNodes(el.childNodes, marksFrom(el, EMPTY));
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
    const text = inlineText(clone);
    // Empty items are usually the leftover of exiting a list with Enter —
    // don't write them back as stray "- " bullets.
    if (!text && !nested.length) return;
    lines.push(`${pad}${ordered ? `${start + i}.` : "-"} ${text}`);
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
