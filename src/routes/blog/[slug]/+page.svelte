<script lang="ts">
  import type { PageData } from "./$types";
  import { marked } from "marked";

  let { data }: { data: PageData } = $props();

  const html = $derived(marked.parse(data.post.content) as string);
</script>

<main class="post-page">
  <a class="back-link" href="/">&larr; home</a>

  <article class="post">
    <p class="meta">{data.post.date}</p>
    <h1>{data.post.title}</h1>

    <div class="prose">{@html html}</div>
  </article>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif;
    background: #faf8f4;
    color: #202020;
  }

  .post-page {
    max-width: 620px;
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

  .post {
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
</style>
