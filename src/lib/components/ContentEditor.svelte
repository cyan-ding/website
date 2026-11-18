<script lang="ts">
  import { dev } from "$app/environment";
  import { marked } from "marked";
  import { onMount, tick, type Snippet } from "svelte";
  import { serializeBlock } from "$lib/html-to-markdown";

  /**
   * Local-only INLINE editor: click "edit inline", then click any rendered
   * paragraph / heading / list / table cell on the page itself and type.
   * The rendered DOM is converted back to markdown and written to the .md
   * file. Untouched blocks keep their original markdown source verbatim, so
   * a one-word fix produces a one-word diff.
   *
   * Production safety: pages only dynamically import this component when
   * `dev` (from $app/environment, a build-time constant) is true, so it is
   * absent from the production bundle entirely, and the backing
   * /api/content endpoint 404s in production. See +server.ts.
   */
  type Props = {
    kind: "blog" | "portfolio";
    slug: string;
    title: string;
    date: string;
    summary: string;
    content: string;
    children: Snippet;
  };

  let props: Props = $props();

  let rootEl = $state<HTMLDivElement | null>(null);
  let editing = $state(false);
  let loading = $state(false);
  // Summary isn't visible on the page, so it isn't editable inline — it's
  // carried through unchanged from the file on every save. (Title and date
  // are read back from the rendered <h1> / date line; see collect().)
  let fDate = $state(props.date);
  let fSummary = $state(props.summary);
  let currentJson = $state("");
  let savedJson = $state("");
  let status = $state<"idle" | "saving" | "saved" | "error">("idle");
  let errorMsg = $state("");
  let savedAt = $state("");

  const dirty = $derived(editing && savedJson !== "" && currentJson !== savedJson);
  const storeKey = () => `inline-editor:${props.kind}:${props.slug}`;

  // Original markdown for each rendered block, keyed by a stable id we stamp
  // on the element. If a block's HTML hasn't changed we write its original
  // source back; only edited blocks are re-serialized from the DOM.
  let baseline = new Map<string, { html: string; raw: string | null }>();

  function splitSource(content: string = props.content) {
    const parts = content.split(/<!--\s*figure:(episode|excavator|splat)\s*-->/);
    const mdParts: string[] = [];
    const figures: string[] = [];
    parts.forEach((p, i) => (i % 2 === 1 ? figures.push(p) : mdParts.push(p)));
    return { mdParts, figures };
  }

  /** Raw top-level markdown blocks for one segment, aligned with rendered DOM blocks. */
  function alignedRaws(part: string, domCount: number): (string | null)[] {
    try {
      const tokens = marked.lexer(part).filter((t) => t.type !== "space");
      if (tokens.length !== domCount) return Array(domCount).fill(null);
      return tokens.map((t) => ("raw" in t && typeof t.raw === "string" ? t.raw.replace(/\s+$/, "") : null));
    } catch {
      return Array(domCount).fill(null);
    }
  }

  const proseSegments = () =>
    rootEl ? [...rootEl.querySelectorAll<HTMLElement>(".prose")] : [];
  const titleEl = () => rootEl?.querySelector<HTMLElement>("article h1") ?? null;
  const dateEl = () => rootEl?.querySelector<HTMLElement>("article .meta") ?? null;

  function setupEditable(sourceContent: string = props.content) {
    if (!rootEl) return;
    baseline = new Map();
    const { mdParts } = splitSource(sourceContent);
    const nonEmptyParts = mdParts.filter((p) => p.trim());

    const h1 = titleEl();
    if (h1) {
      h1.dataset.inlineId = "title";
      h1.setAttribute("contenteditable", "true");
      h1.setAttribute("spellcheck", "false");
    }

    // The date line above the title is editable in place too (YYYY-MM-DD).
    const meta = dateEl();
    if (meta) {
      meta.dataset.inlineId = "date";
      meta.setAttribute("contenteditable", "true");
      meta.setAttribute("spellcheck", "false");
      meta.setAttribute("title", "Date — YYYY-MM-DD");
    }

    // ONE editable region per prose segment — not one per block. With
    // per-block islands, Enter at a block boundary (e.g. in a list) made
    // the browser create elements outside the island, which then saved
    // as stray sections/bullets. Inside a single region, Enter, splits
    // and list exits all stay in the flow and serialize correctly.
    // Ask the browser for <b>/<i> rather than span styles, in case a native
    // shortcut still runs. Our own handler doesn't depend on it.
    try { document.execCommand("styleWithCSS", false, "false"); } catch { /* ignore */ }

    proseSegments().forEach((seg, si) => {
      seg.dataset.inlineId = `seg:${si}`;
      seg.setAttribute("contenteditable", "true");
      seg.setAttribute("spellcheck", "false");
      const blocks = [...seg.children].filter((c): c is HTMLElement => c instanceof HTMLElement);
      const raws = alignedRaws(nonEmptyParts[si] ?? "", blocks.length);
      blocks.forEach((block, bi) => {
        const id = `${si}:${bi}`;
        block.dataset.inlineId = id;
        baseline.set(id, { html: block.innerHTML, raw: raws[bi] ?? null });
      });
    });
  }

  function teardownEditable() {
    rootEl?.querySelectorAll("[contenteditable]").forEach((el) => el.removeAttribute("contenteditable"));
  }

  function serializeUnit(el: HTMLElement): string {
    const id = el.dataset.inlineId;
    const base = id ? baseline.get(id) : undefined;
    if (base?.raw != null && el.innerHTML === base.html) return base.raw;
    return serializeBlock(el);
  }

  function collect() {
    const article = rootEl?.querySelector("article");
    const blocks: string[] = [];
    if (article) {
      const { figures } = splitSource();
      const queue = [...figures];
      for (const child of [...article.children] as HTMLElement[]) {
        if (child.classList.contains("prose")) {
          for (const block of [...child.children] as HTMLElement[]) {
            const md = serializeUnit(block);
            if (md) blocks.push(md);
          }
        } else if (child !== titleEl() && !child.classList.contains("meta") && queue.length) {
          // An interactive figure component (episode / excavator / splat).
          blocks.push(`<!-- figure:${queue.shift()} -->`);
        }
      }
    }
    return {
      title: (titleEl()?.textContent ?? props.title).replace(/\s+/g, " ").trim(),
      date: (dateEl()?.textContent ?? fDate).replace(/\s+/g, " ").trim(),
      summary: fSummary,
      content: blocks.join("\n\n")
    };
  }

  const collectJson = () => JSON.stringify(collect());

  let closing = false;

  function refresh() {
    if (!editing) return;
    currentJson = collectJson();
    // Nothing is written to disk until Done, but keep the unsaved draft in
    // sessionStorage so an accidental reload doesn't lose it. (Not while
    // Done is saving — that would reopen the editor on the hot-reload.)
    if (!closing) persistSession(captureFocus());
  }

  // ---- focus capture / restore (survives the HMR remount after a save) ----
  type Focus = { id: string; offset: number };
  function captureFocus(): Focus | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.anchorNode) return null;
    const anchorEl =
      sel.anchorNode instanceof HTMLElement ? sel.anchorNode : sel.anchorNode.parentElement;
    const target = anchorEl?.closest<HTMLElement>("[contenteditable][data-inline-id]");
    if (!target || !rootEl?.contains(target)) return null;
    const range = document.createRange();
    range.selectNodeContents(target);
    range.setEnd(sel.anchorNode, sel.anchorOffset);
    return { id: target.dataset.inlineId!, offset: range.toString().length };
  }

  function restoreFocus(focus: Focus) {
    const target = rootEl?.querySelector<HTMLElement>(`[contenteditable][data-inline-id="${focus.id}"]`);
    if (!target) return;
    target.focus();
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    let remaining = focus.offset;
    let node: Node | null;
    const range = document.createRange();
    while ((node = walker.nextNode())) {
      const len = node.textContent?.length ?? 0;
      if (remaining <= len) {
        range.setStart(node, remaining);
        range.collapse(true);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        return;
      }
      remaining -= len;
    }
    range.selectNodeContents(target);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  function persistSession(focus: Focus | null) {
    try {
      sessionStorage.setItem(
        storeKey(),
        JSON.stringify({ open: true, focus, draft: currentJson || undefined })
      );
    } catch { /* ignore */ }
  }

  // ---- lifecycle ----
  onMount(() => {
    if (!dev) return;
    try {
      if (JSON.parse(sessionStorage.getItem(storeKey()) ?? "null")?.open) void startEdit(true);
    } catch { /* ignore */ }
  });

  /** Re-render the page from an unsaved draft (after an accidental reload). */
  function applyDraft(draft: { title: string; date: string; summary: string; content: string }) {
    if (titleEl()) titleEl()!.textContent = draft.title;
    if (dateEl()) dateEl()!.textContent = draft.date;
    fDate = draft.date;
    fSummary = draft.summary;
    const { mdParts } = splitSource(draft.content);
    const nonEmptyParts = mdParts.filter((p) => p.trim());
    proseSegments().forEach((seg, si) => {
      seg.innerHTML = marked.parse(nonEmptyParts[si] ?? "") as string;
    });
    setupEditable(draft.content);
  }

  async function startEdit(restore = false) {
    loading = true;
    errorMsg = "";
    let focus: Focus | null = null;
    let draft: ReturnType<typeof collect> | null = null;
    let diskJson = "";
    try {
      const stored = restore ? JSON.parse(sessionStorage.getItem(storeKey()) ?? "null") : null;
      focus = stored?.focus ?? null;
      if (stored?.draft) draft = JSON.parse(stored.draft);
      // Fresh frontmatter from disk (title is read from the rendered <h1>).
      const res = await fetch(`/api/content/${props.kind}/${props.slug}`);
      if (res.ok) {
        const data = await res.json();
        fDate = data.date;
        fSummary = data.summary;
        diskJson = JSON.stringify({ title: data.title, date: data.date, summary: data.summary, content: data.content });
      }
    } catch { /* fall back to rendered values */ }
    editing = true;
    loading = false;
    await tick();
    setupEditable();
    savedJson = diskJson || collectJson();
    if (draft && JSON.stringify(draft) !== savedJson) {
      applyDraft(draft);
    }
    currentJson = collectJson();
    status = "idle";
    persistSession(focus);
    if (restore && focus) restoreFocus(focus);
  }

  async function save(): Promise<boolean> {
    refresh();
    if (!dirty) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(collect().date)) {
      status = "error";
      errorMsg = "date must be YYYY-MM-DD";
      return false;
    }
    const sent = currentJson;
    status = "saving";
    errorMsg = "";
    try {
      const res = await fetch(`/api/content/${props.kind}/${props.slug}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: sent
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      savedJson = sent;
      savedAt = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      status = "saved";
      return true;
    } catch (e) {
      status = "error";
      errorMsg = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  // No autosave: nothing is written to disk (so nothing hot-reloads) until
  // Done is clicked. Unsaved work lives in the page + the sessionStorage
  // draft, and beforeunload warns if you try to leave with unsaved changes.
  async function done() {
    // Close the session *before* saving, so the save's hot-reload doesn't
    // reopen the editor on the refreshed page.
    closing = true;
    try { sessionStorage.removeItem(storeKey()); } catch { /* ignore */ }
    if (dirty && !(await save())) {
      closing = false;
      persistSession(captureFocus());
      return;
    }
    teardownEditable();
    editing = false;
    status = "idle";
  }

  /**
   * ⌘/Ctrl+B and ⌘/Ctrl+I. The native contenteditable commands are skipped
   * or applied as a styled <span> often enough that bold and italic vanish
   * on save. Apply <strong>/<em> ourselves. If a native command still runs
   * (some browsers ignore preventDefault on these shortcuts), don't toggle
   * a second time — the serializer understands that markup too.
   */
  let formatTimer: number | null = null;

  function weightBold(fw: string) {
    if (fw === "bold" || fw === "bolder") return true;
    const n = Number(fw);
    return Number.isFinite(n) && n >= 600;
  }
  function weightOff(fw: string) {
    return fw === "normal" || fw === "400" || fw === "lighter";
  }

  function hostOf(node: Node | null): HTMLElement | null {
    const el = node instanceof Element ? node : node?.parentElement;
    return el?.closest<HTMLElement>("[contenteditable]") ?? null;
  }

  function blockedFormatTarget(node: Node | null) {
    const el = node instanceof Element ? node : node?.parentElement;
    return !!el?.closest("pre, code, h1, .meta");
  }

  /** Nearest element that actually carries this mark, ignoring a closer "off" style. */
  function markAncestor(node: Node | null, kind: "bold" | "italic", host: HTMLElement): HTMLElement | null {
    let el: HTMLElement | null =
      node instanceof HTMLElement ? node : node?.parentElement instanceof HTMLElement ? node.parentElement : null;
    while (el && el !== host) {
      if (kind === "bold") {
        if (weightOff(el.style.fontWeight)) return null;
        if (el.tagName === "STRONG" || el.tagName === "B" || weightBold(el.style.fontWeight)) return el;
      } else if (el.style.fontStyle === "normal") {
        return null;
      } else if (el.tagName === "EM" || el.tagName === "I" || el.style.fontStyle === "italic" || el.style.fontStyle === "oblique") {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  function hasMark(node: Node, stop: Node, kind: "bold" | "italic"): boolean {
    let el = node.parentElement;
    while (el && el !== stop) {
      if (kind === "bold") {
        if (weightOff(el.style.fontWeight)) return false;
        if (el.tagName === "STRONG" || el.tagName === "B" || weightBold(el.style.fontWeight)) return true;
      } else if (el.style.fontStyle === "normal") {
        return false;
      } else if (el.tagName === "EM" || el.tagName === "I" || el.style.fontStyle === "italic" || el.style.fontStyle === "oblique") {
        return true;
      }
      el = el.parentElement;
    }
    return false;
  }

  function rangeIsMarked(range: Range, kind: "bold" | "italic", host: HTMLElement): boolean {
    const slice = (text: Text) => {
      const start = text === range.startContainer ? range.startOffset : 0;
      const end = text === range.endContainer ? range.endOffset : text.length;
      return text.data.slice(start, end).replace(/\u200B/g, "");
    };
    const root = range.commonAncestorContainer;
    if (root.nodeType === Node.TEXT_NODE) {
      const text = slice(root as Text);
      return !!text.trim() && hasMark(root, host, kind);
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let any = false;
    let node: Node | null;
    while ((node = walker.nextNode())) {
      try {
        if (!range.intersectsNode(node)) continue;
      } catch {
        continue;
      }
      if (!slice(node as Text).trim()) continue;
      any = true;
      if (!hasMark(node, host, kind)) return false;
    }
    return any;
  }

  function unwrap(el: HTMLElement) {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    el.remove();
  }

  function stripMark(root: ParentNode, kind: "bold" | "italic") {
    for (const el of [...root.querySelectorAll<HTMLElement>("*")].reverse()) {
      if (kind === "bold") {
        if (el.tagName === "STRONG" || el.tagName === "B") {
          unwrap(el);
          continue;
        }
        if (weightBold(el.style.fontWeight)) {
          el.style.fontWeight = "";
          if (!el.getAttribute("style")?.trim() && (el.tagName === "SPAN" || el.tagName === "FONT")) unwrap(el);
        }
      } else if (el.tagName === "EM" || el.tagName === "I") {
        unwrap(el);
      } else if (el.style.fontStyle === "italic" || el.style.fontStyle === "oblique") {
        el.style.fontStyle = "";
        if (!el.getAttribute("style")?.trim() && (el.tagName === "SPAN" || el.tagName === "FONT")) unwrap(el);
      }
    }
  }

  function placeCaret(node: Node, offset: number) {
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  /** Caret with nothing selected: turn the mark on or off for the next characters. */
  function toggleCaret(kind: "bold" | "italic", range: Range, host: HTMLElement) {
    const existing = markAncestor(range.startContainer, kind, host);
    const tag = kind === "bold" ? "strong" : "em";
    if (!existing) {
      const el = document.createElement(tag);
      // Two zero-width spaces keep the caret inside the new element. A caret
      // parked on the edge falls out, so the next character is plain.
      el.textContent = "\u200B\u200B";
      range.insertNode(el);
      placeCaret(el.firstChild!, 1);
      return;
    }

    const before = document.createRange();
    before.selectNodeContents(existing);
    before.setEnd(range.startContainer, range.startOffset);
    const after = document.createRange();
    after.selectNodeContents(existing);
    after.setStart(range.startContainer, range.startOffset);
    const beforeEmpty = !before.toString().replace(/\u200B/g, "");
    const afterEmpty = !after.toString().replace(/\u200B/g, "");

    if (beforeEmpty || afterEmpty) {
      const sibling = beforeEmpty ? existing.previousSibling : existing.nextSibling;
      if (sibling?.nodeType === Node.TEXT_NODE) {
        placeCaret(sibling, beforeEmpty ? (sibling.textContent?.length ?? 0) : 0);
      } else {
        const holder = document.createTextNode("\u200B");
        if (beforeEmpty) existing.before(holder);
        else existing.after(holder);
        placeCaret(holder, holder.textContent?.length ?? 0);
      }
      if (!(existing.textContent ?? "").replace(/\u200B/g, "")) existing.remove();
      return;
    }

    const frag = after.extractContents();
    const rest = document.createElement(tag);
    rest.appendChild(frag);
    const holder = document.createTextNode("\u200B\u200B");
    existing.after(rest);
    existing.after(holder);
    if (!(existing.textContent ?? "").replace(/\u200B/g, "")) existing.remove();
    if (!(rest.textContent ?? "").replace(/\u200B/g, "")) rest.remove();
    placeCaret(holder, 1);
  }

  type SavedRange = { sc: Node; so: number; ec: Node; eo: number };

  /** One range per block, so a selection across paragraphs doesn't wrap the blocks themselves. */
  function rangesInSelection(range: Range, host: HTMLElement): SavedRange[] {
    const selector = "p, h2, h3, h4, h5, h6, li, td, th, figcaption, blockquote";
    const all = [...host.querySelectorAll<HTMLElement>(selector)].filter((b) => {
      try { return range.intersectsNode(b); } catch { return false; }
    });
    const blocks = all.filter((b) => !all.some((o) => o !== b && b.contains(o)));
    if (!blocks.length) {
      return [{ sc: range.startContainer, so: range.startOffset, ec: range.endContainer, eo: range.endOffset }];
    }
    const saved: SavedRange[] = [];
    for (const block of blocks) {
      if (block.closest("pre")) continue;
      const sub = document.createRange();
      sub.selectNodeContents(block);
      if (range.compareBoundaryPoints(Range.START_TO_START, sub) > 0) {
        sub.setStart(range.startContainer, range.startOffset);
      }
      if (range.compareBoundaryPoints(Range.END_TO_END, sub) < 0) {
        sub.setEnd(range.endContainer, range.endOffset);
      }
      if (!sub.collapsed && sub.toString().replace(/\u200B/g, "").length) {
        saved.push({ sc: sub.startContainer, so: sub.startOffset, ec: sub.endContainer, eo: sub.endOffset });
      }
    }
    return saved;
  }

  function clampOffset(node: Node, offset: number) {
    const max = node.nodeType === Node.TEXT_NODE ? (node.textContent?.length ?? 0) : node.childNodes.length;
    return Math.max(0, Math.min(offset, max));
  }

  /** Pull [start, end] out of a bold/italic ancestor so a toggle doesn't nest or stick. */
  function liftOut(el: HTMLElement, start: Node, end: Node) {
    const parent = el.parentNode;
    if (!parent || !el.contains(start) || !el.contains(end)) return;
    const after = el.cloneNode(false) as HTMLElement;
    let n = end.nextSibling;
    while (n && el.contains(n)) {
      const next = n.nextSibling;
      after.appendChild(n);
      n = next;
    }
    const ref = el.nextSibling;
    if (after.childNodes.length) parent.insertBefore(after, ref);
    const placeBefore = after.parentNode === parent ? after : ref;
    let m: Node | null = start;
    while (m && el.contains(m)) {
      const next: Node | null = m === end ? null : m.nextSibling;
      parent.insertBefore(m, placeBefore);
      if (m === end) break;
      m = next;
    }
    const empty = (node: HTMLElement) =>
      !(node.textContent ?? "").replace(/\u200B/g, "").trim() && !node.querySelector("img, br");
    if (empty(el)) el.remove();
    if (after.parentNode && empty(after)) after.remove();
  }

  function liftInserted(start: Node, end: Node, kind: "bold" | "italic", host: HTMLElement) {
    let guard = 0;
    while (start.isConnected && guard++ < 8) {
      const from = start instanceof HTMLElement ? start.parentElement : start;
      const el = from ? markAncestor(from, kind, host) : null;
      if (!el || !el.contains(end)) break;
      liftOut(el, start, end);
    }
  }

  function applyToRange(saved: SavedRange, kind: "bold" | "italic", host: HTMLElement): { start: Node; end: Node } | null {
    const range = document.createRange();
    try {
      range.setStart(saved.sc, clampOffset(saved.sc, saved.so));
      range.setEnd(saved.ec, clampOffset(saved.ec, saved.eo));
    } catch {
      return null;
    }
    if (range.collapsed) return null;
    const on = rangeIsMarked(range, kind, host);
    const fragment = range.extractContents();
    if (!(fragment.textContent ?? "").replace(/\u200B/g, "").trim()) {
      range.insertNode(fragment);
      return null;
    }
    stripMark(fragment, kind);
    if (!on) {
      const wrapper = document.createElement(kind === "bold" ? "strong" : "em");
      while (fragment.firstChild) wrapper.appendChild(fragment.firstChild);
      fragment.appendChild(wrapper);
    }
    const startMark = document.createComment("");
    const endMark = document.createComment("");
    fragment.insertBefore(startMark, fragment.firstChild);
    fragment.appendChild(endMark);
    range.insertNode(fragment);
    const start = startMark.nextSibling;
    const end = endMark.previousSibling;
    startMark.remove();
    endMark.remove();
    if (!start || !end || !start.isConnected || !end.isConnected) return null;
    // Turning the mark off has to leave the text, which extractContents puts
    // back inside the tag when the selection sat entirely within it. Turning
    // it on has to hoist a fresh tag out of one it landed inside.
    liftInserted(start, end, kind, host);
    return { start, end };
  }

  function toggleInline(kind: "bold" | "italic") {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!rootEl?.contains(range.commonAncestorContainer)) return;
    if (blockedFormatTarget(range.startContainer) || blockedFormatTarget(range.endContainer)) return;
    const host = hostOf(range.commonAncestorContainer);
    if (!host) return;

    if (range.collapsed) {
      toggleCaret(kind, range, host);
    } else {
      const saved = rangesInSelection(range, host);
      const applied: { start: Node; end: Node }[] = [];
      for (let i = saved.length - 1; i >= 0; i--) {
        const ref = applyToRange(saved[i], kind, host);
        if (ref) applied.push(ref);
      }
      if (applied.length) {
        const first = applied[applied.length - 1];
        const last = applied[0];
        const next = document.createRange();
        try {
          next.setStartBefore(first.start);
          next.setEndAfter(last.end);
          sel.removeAllRanges();
          sel.addRange(next);
        } catch { /* selection restore is best-effort */ }
      }
    }
    refresh();
  }

  function scheduleFormat(kind: "bold" | "italic") {
    const sel = window.getSelection();
    const host = sel && sel.rangeCount ? hostOf(sel.getRangeAt(0).commonAncestorContainer) : null;
    const before = host?.innerHTML ?? null;
    if (formatTimer) clearTimeout(formatTimer);
    formatTimer = window.setTimeout(() => {
      formatTimer = null;
      // A native command that actually changed the DOM already did the job.
      if (before != null && host?.isConnected && host.innerHTML !== before) {
        refresh();
        return;
      }
      toggleInline(kind);
    }, 0);
  }

  /** Title and date are single-line: Enter blurs instead of splitting them. */
  function onRootKeydown(e: KeyboardEvent) {
    if (!editing) return;
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && !e.repeat) {
      const bold = e.code === "KeyB" || e.key.toLowerCase() === "b";
      const italic = e.code === "KeyI" || e.key.toLowerCase() === "i";
      if (bold || italic) {
        e.preventDefault();
        scheduleFormat(bold ? "bold" : "italic");
        return;
      }
    }
    if (e.key !== "Enter" || e.shiftKey) return;
    const t = e.target as HTMLElement;
    const singleLine = t.closest("h1, .meta");
    if (singleLine) {
      e.preventDefault();
      (singleLine as HTMLElement).blur();
      return;
    }
    if (t.closest(".prose")) {
      e.preventDefault();
      handleEnter();
    }
  }

  function placeCaretAtStart(el: HTMLElement) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  /**
   * Deterministic Enter handling. Left to the browser, Enter at a block or
   * list-item boundary creates elements in unpredictable places (e.g. an
   * empty <li> at the top of a list, or a block outside the editable flow).
   * Instead: split the current list item / paragraph / heading at the
   * caret, move the after-caret content into the new block, and put the
   * caret at its start. Enter on an empty list item exits the list.
   */
  function handleEnter() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.anchorNode) return;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) range.deleteContents();
    const anchorEl =
      sel.anchorNode instanceof HTMLElement ? sel.anchorNode : sel.anchorNode.parentElement;
    if (!anchorEl) return;

    if (anchorEl.closest("pre")) {
      document.execCommand("insertText", false, "\n");
      refresh();
      return;
    }
    if (anchorEl.closest("td, th")) {
      document.execCommand("insertLineBreak");
      refresh();
      return;
    }

    const afterFrag = (container: Node) => {
      const after = document.createRange();
      after.setStart(sel.anchorNode!, sel.anchorOffset);
      after.setEnd(container, container.childNodes.length);
      return after.extractContents();
    };

    const li = anchorEl.closest("li") as HTMLElement | null;
    if (li) {
      const list = li.parentElement as HTMLElement;
      const line = (anchorEl.closest("p") && li.contains(anchorEl.closest("p"))
        ? anchorEl.closest("p")
        : li) as HTMLElement;
      const hasNested = !!li.querySelector("ul, ol");
      if (!li.textContent?.trim() && !hasNested) {
        // Exit the list at this point: items before stay in the list, the
        // empty item becomes a paragraph, and any items after continue in
        // a new list below it (rather than the paragraph jumping to the
        // end of the whole list).
        const items = [...list.children] as HTMLElement[];
        const following = items.slice(items.indexOf(li) + 1);
        const p = document.createElement("p");
        p.innerHTML = "<br>";
        li.remove();
        list.after(p);
        if (following.length) {
          const rest = document.createElement(list.tagName);
          following.forEach((item) => rest.appendChild(item));
          p.after(rest);
        }
        if (!list.children.length) list.remove();
        placeCaretAtStart(p);
      } else {
        const newLi = document.createElement("li");
        const frag = afterFrag(line);
        if (line.tagName === "P") {
          const p = document.createElement("p");
          p.appendChild(frag);
          newLi.appendChild(p);
        } else {
          newLi.appendChild(frag);
        }
        if (!newLi.textContent) newLi.innerHTML = line.tagName === "P" ? "<p><br></p>" : "<br>";
        list.insertBefore(newLi, li.nextSibling);
        placeCaretAtStart(newLi);
      }
      refresh();
      return;
    }

    const block = anchorEl.closest("p, h2, h3, h4, h5, h6") as HTMLElement | null;
    if (block) {
      // Headings continue as body text; other blocks continue as themselves.
      const newBlock = document.createElement("p");
      newBlock.appendChild(afterFrag(block));
      if (!newBlock.textContent) newBlock.innerHTML = "<br>";
      block.after(newBlock);
      placeCaretAtStart(newBlock);
      refresh();
      return;
    }

    // Caret is between blocks: insert a fresh paragraph right there.
    const p = document.createElement("p");
    p.innerHTML = "<br>";
    range.insertNode(p);
    placeCaretAtStart(p);
    refresh();
  }

  function onBeforeUnload(e: BeforeUnloadEvent) {
    if (editing && dirty) e.preventDefault();
  }

  function onPaste(e: ClipboardEvent) {
    if (!editing) return;
    e.preventDefault();
    document.execCommand("insertText", false, e.clipboardData?.getData("text/plain") ?? "");
  }

  function onBeforeInput(e: InputEvent) {
    if (!editing) return;
    if (e.inputType !== "formatBold" && e.inputType !== "formatItalic") return;
    // Cancel the native command when we can. scheduleFormat still applies the
    // mark if the browser went ahead and changed nothing.
    e.preventDefault();
  }

  function onClickCapture(e: MouseEvent) {
    if (editing && (e.target as HTMLElement).closest("a")) e.preventDefault();
    if (editing) persistSession(captureFocus());
  }
</script>

<svelte:window onbeforeunload={onBeforeUnload} />

{#if dev}
  <div
    class="inline-root"
    class:editing
    bind:this={rootEl}
    oninput={refresh}
    onkeydown={onRootKeydown}
    onbeforeinput={onBeforeInput}
    onclickcapture={onClickCapture}
    onpaste={onPaste}
    role="presentation"
  >
    {#if !editing}
      <div class="dev-bar">
        <span class="dev-badge">local dev only</span>
        <button type="button" class="pill-btn" onclick={() => void startEdit()} disabled={loading}>
          {loading ? "opening…" : "✎ edit inline"}
        </button>
      </div>
    {:else}
      <div class="dev-bar">
        <span class="dev-badge">editing inline</span>
        <span class="hint">⌘B bold · ⌘I italic</span>
        <span class="status" class:error={status === "error"}>
          {#if status === "saving"}saving…
          {:else if status === "error"}save failed{errorMsg ? `: ${errorMsg}` : ""}
          {:else if dirty}unsaved changes — click done to save
          {:else if status === "saved"}saved {savedAt}
          {:else}click any text and type{/if}
        </span>
        <button type="button" class="pill-btn done-btn" onclick={() => void done()}>done</button>
      </div>
    {/if}

    {@render props.children()}
  </div>
{:else}
  {@render props.children()}
{/if}

<style>
  .dev-bar {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 0.4rem;
    font-family: ui-sans-serif, -apple-system, "Helvetica Neue", sans-serif;
  }

  .dev-badge {
    font-size: 0.62rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #a06a00;
    background: rgba(255, 180, 0, 0.14);
    border: 1px solid rgba(200, 140, 0, 0.35);
    padding: 0.12rem 0.4rem;
    border-radius: 999px;
    white-space: nowrap;
  }

  .pill-btn {
    font-family: ui-sans-serif, -apple-system, "Helvetica Neue", sans-serif;
    font-size: 0.74rem;
    color: #444;
    background: #fff;
    border: 1px solid rgba(0, 0, 0, 0.18);
    border-radius: 999px;
    padding: 0.28rem 0.75rem;
    cursor: pointer;
  }

  .pill-btn:hover:not(:disabled) { color: #111; border-color: rgba(0, 0, 0, 0.4); }
  .pill-btn:disabled { opacity: 0.45; cursor: default; }

  .done-btn { background: #202020 !important; color: #faf8f4 !important; border-color: #202020 !important; }

  /* Editable regions: subtle affordance, no layout change. The prose
     segment is the editable element; outline the block you're in, not
     the whole segment. */
  .inline-root.editing :global([contenteditable="true"]) {
    cursor: text;
    outline: none;
  }

  .inline-root.editing :global([data-inline-id="title"]:hover),
  .inline-root.editing :global([data-inline-id="date"]:hover),
  .inline-root.editing :global(.prose > *:hover) {
    outline: 1px dashed rgba(200, 140, 0, 0.45);
    outline-offset: 3px;
    border-radius: 3px;
    background: rgba(255, 180, 0, 0.05);
  }

  .inline-root.editing :global([data-inline-id="title"]:focus),
  .inline-root.editing :global([data-inline-id="date"]:focus),
  .inline-root.editing :global(.prose > *:focus-within) {
    outline: 1px solid rgba(200, 140, 0, 0.8);
    outline-offset: 3px;
    border-radius: 3px;
    background: rgba(255, 180, 0, 0.06);
  }

  .hint, .status { font-size: 0.72rem; color: #8a8a8a; white-space: nowrap; }
  .status.error { color: #b3261e; }
</style>
