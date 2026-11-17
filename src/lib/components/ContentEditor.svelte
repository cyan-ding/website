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

  function splitSource() {
    const parts = props.content.split(/<!--\s*figure:(episode|excavator|splat)\s*-->/);
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

  function editableTarget(block: HTMLElement): HTMLElement | null {
    if (block.tagName === "FIGURE") return block.querySelector<HTMLElement>("figcaption");
    if (block.tagName === "HR") return null;
    return block;
  }

  function setupEditable() {
    if (!rootEl) return;
    baseline = new Map();
    const { mdParts } = splitSource();
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

    proseSegments().forEach((seg, si) => {
      const blocks = [...seg.children].filter((c): c is HTMLElement => c instanceof HTMLElement);
      const raws = alignedRaws(nonEmptyParts[si] ?? "", blocks.length);
      blocks.forEach((block, bi) => {
        const id = `${si}:${bi}`;
        block.dataset.inlineId = id;
        baseline.set(id, { html: block.innerHTML, raw: raws[bi] ?? null });
        const target = editableTarget(block);
        if (target) {
          target.dataset.inlineId = id;
          target.setAttribute("contenteditable", "true");
          target.setAttribute("spellcheck", "false");
        }
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

  function refresh() {
    if (editing) currentJson = collectJson();
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
      sessionStorage.setItem(storeKey(), JSON.stringify({ open: true, focus }));
    } catch { /* ignore */ }
  }

  // ---- lifecycle ----
  onMount(() => {
    if (!dev) return;
    try {
      if (JSON.parse(sessionStorage.getItem(storeKey()) ?? "null")?.open) void startEdit(true);
    } catch { /* ignore */ }
  });

  async function startEdit(restore = false) {
    loading = true;
    errorMsg = "";
    let focus: Focus | null = null;
    try {
      const stored = restore ? JSON.parse(sessionStorage.getItem(storeKey()) ?? "null") : null;
      focus = stored?.focus ?? null;
      // Fresh frontmatter from disk (title is read from the rendered <h1>).
      const res = await fetch(`/api/content/${props.kind}/${props.slug}`);
      if (res.ok) {
        const data = await res.json();
        fDate = data.date;
        fSummary = data.summary;
      }
    } catch { /* fall back to rendered values */ }
    editing = true;
    loading = false;
    await tick();
    setupEditable();
    currentJson = collectJson();
    savedJson = currentJson;
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
    const focus = captureFocus();
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
      persistSession(focus);
      return true;
    } catch (e) {
      status = "error";
      errorMsg = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  // Autosave shortly after you stop typing. (Typing itself is never
  // interrupted: the debounce only fires once input pauses, and after the
  // save's hot-reload the editor reopens at your cursor — see onMount.)
  $effect(() => {
    if (!editing || !dirty || status === "saving") return;
    const t = setTimeout(() => void save(), 1200);
    return () => clearTimeout(t);
  });

  async function done() {
    if (dirty && !(await save())) return;
    try { sessionStorage.removeItem(storeKey()); } catch { /* ignore */ }
    teardownEditable();
    editing = false;
    status = "idle";
  }

  function onKeydown(e: KeyboardEvent) {
    if (editing && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void save();
    }
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

<svelte:window onkeydown={onKeydown} onbeforeunload={onBeforeUnload} />

{#if dev}
  <div
    class="inline-root"
    class:editing
    bind:this={rootEl}
    oninput={refresh}
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
          {:else if dirty}unsaved — autosaves in a moment
          {:else if status === "saved"}saved {savedAt}
          {:else}click any text and type{/if}
        </span>
        <button type="button" class="pill-btn" onclick={() => void save()} disabled={!dirty || status === "saving"}>save</button>
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

  /* Editable regions: subtle affordance, no layout change. */
  .inline-root.editing :global([contenteditable="true"]) {
    cursor: text;
    border-radius: 3px;
    outline: 1px dashed transparent;
    outline-offset: 3px;
    transition: outline-color 120ms ease, background 120ms ease;
  }

  .inline-root.editing :global([contenteditable="true"]:hover) {
    outline-color: rgba(200, 140, 0, 0.45);
    background: rgba(255, 180, 0, 0.05);
  }

  .inline-root.editing :global([contenteditable="true"]:focus) {
    outline: 1px solid rgba(200, 140, 0, 0.8);
    background: rgba(255, 180, 0, 0.06);
  }

  .status { font-size: 0.72rem; color: #8a8a8a; white-space: nowrap; }
  .status.error { color: #b3261e; }
</style>
