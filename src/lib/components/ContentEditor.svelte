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

  /** Title and date are single-line: Enter blurs instead of splitting them. */
  function onRootKeydown(e: KeyboardEvent) {
    if (!editing || e.key !== "Enter" || e.shiftKey) return;
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

  .status { font-size: 0.72rem; color: #8a8a8a; white-space: nowrap; }
  .status.error { color: #b3261e; }
</style>
