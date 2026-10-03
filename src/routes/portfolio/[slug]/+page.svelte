<script lang="ts">
  import type { PageData } from "./$types";
  import { marked } from "marked";
  import EpisodeFrame from "$lib/components/portfolio/EpisodeFrame.svelte";
  import ExcavatorFrame from "$lib/components/portfolio/ExcavatorFrame.svelte";
  import SplatFrame from "$lib/components/portfolio/SplatFrame.svelte";

  let { data }: { data: PageData } = $props();

  type Segment =
    | { kind: "md"; html: string }
    | { kind: "episode" | "excavator" | "splat" };

  function segmentContent(content: string): Segment[] {
    const parts = content.split(/<!--\s*figure:(episode|excavator|splat)\s*-->/);
    const segments: Segment[] = [];

    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 1) {
        const kind = parts[i];
        if (kind === "episode" || kind === "excavator" || kind === "splat") {
          segments.push({ kind });
        }
        continue;
      }

      const markdown = parts[i].trim();
      if (!markdown) continue;
      segments.push({ kind: "md", html: marked.parse(markdown) as string });
    }

    return segments;
  }

  const segments = $derived(segmentContent(data.entry.content));
</script>

<main class="entry-page">
  <a class="back-link" href="/portfolio">&larr; portfolio</a>

  <article class="entry">
    <p class="meta">{data.entry.date}</p>
    <h1>{data.entry.title}</h1>

    {#each segments as segment}
      {#if segment.kind === "md"}
        <div class="prose">{@html segment.html}</div>
      {:else if segment.kind === "episode"}
        <EpisodeFrame />
      {:else if segment.kind === "excavator"}
        <ExcavatorFrame />
      {:else if segment.kind === "splat"}
        <SplatFrame />
      {/if}
    {/each}
  </article>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif;
    background: #faf8f4;
    color: #202020;
  }

  .entry-page {
    max-width: 720px;
    margin: 0 auto;
    padding: 3.2rem 1.4rem 4rem;
    font-size: 0.88rem;
    line-height: 1.9;
  }

  .back-link {
    color: #666;
    text-decoration: none;
    letter-spacing: 0.03em;
  }

  .back-link:hover {
    color: #222;
  }

  .entry {
    margin-top: 1.6rem;
  }

  .meta {
    color: #868686;
    margin-bottom: 0.2rem;
  }

  h1 {
    font-size: 1.28rem;
    margin: 0 0 1.6rem;
    font-weight: 500;
    letter-spacing: 0.02em;
  }

  .prose :global(p) {
    margin: 0 0 1rem;
  }

  .prose :global(h2) {
    font-size: 1.1rem;
    font-weight: 500;
    margin: 2rem 0 0.6rem;
  }

  .prose :global(h3) {
    font-size: 0.96rem;
    font-weight: 500;
    margin: 1.6rem 0 0.5rem;
  }

  .prose :global(a) {
    color: #555;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .prose :global(code) {
    font-size: 0.82em;
    background: rgba(0, 0, 0, 0.04);
    padding: 0.15em 0.35em;
    border-radius: 3px;
  }

  .prose :global(pre) {
    background: rgba(0, 0, 0, 0.03);
    padding: 1rem 1.2rem;
    border-radius: 5px;
    overflow-x: auto;
    font-size: 0.82rem;
    line-height: 1.6;
  }

  .prose :global(pre code) {
    background: none;
    padding: 0;
  }

  .prose :global(blockquote) {
    margin: 1.2rem 0;
    padding-left: 1rem;
    border-left: 2px solid rgba(0, 0, 0, 0.12);
    color: #555;
  }

  .prose :global(ul),
  .prose :global(ol) {
    padding-left: 1.4rem;
    margin: 0.6rem 0 1rem;
  }

  .prose :global(li) {
    margin-bottom: 0.3rem;
  }

  .prose :global(img) {
    max-width: 100%;
    border-radius: 4px;
    margin: 1rem 0;
  }

  .prose :global(hr) {
    border: none;
    border-top: 1px solid rgba(0, 0, 0, 0.08);
    margin: 2rem 0;
  }

  .prose {
    max-width: 100%;
    overflow-x: auto;
  }

  .prose :global(table) {
    width: 100%;
    max-width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    margin: 0.8rem 0 1.4rem;
    font-size: 0.78rem;
    line-height: 1.55;
  }

  .prose :global(th),
  .prose :global(td) {
    text-align: left;
    vertical-align: top;
    padding: 0.45rem 0.7rem 0.45rem 0;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    overflow-wrap: break-word;
  }

  .prose :global(th:nth-child(1)),
  .prose :global(td:nth-child(1)) {
    width: 22%;
  }

  .prose :global(th:nth-child(3)),
  .prose :global(td:nth-child(3)) {
    width: 28%;
  }

  .prose :global(th) {
    font-weight: 500;
    color: #444;
  }

  @media (max-width: 700px) {
    .entry-page {
      padding: 1.15rem 1.25rem 3.5rem;
      font-size: 0.9rem;
    }
  }
</style>
