<script lang="ts">
  import { readings } from "$lib/readings";
</script>

<main class="readings-page">
  <header>
    <h1>Readings</h1>
    <p class="intro">Recommended readings.</p>
  </header>

  <section class="readings" aria-label="Readings">
    {#each readings as reading}
      {#if reading.url}
        <a
          class="reading"
          href={reading.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {@render entry(reading)}
        </a>
      {:else}
        <article class="reading">
          {@render entry(reading)}
        </article>
      {/if}
    {/each}
  </section>
</main>

{#snippet entry(reading: (typeof readings)[number])}
  <p class="meta">
    {reading.kind}{#if reading.year}&nbsp;&middot;&nbsp;{reading.year}{/if}
  </p>
  <h2>{reading.title}</h2>
  <p class="author">{reading.author}</p>
  {#if reading.note}
    <p class="note">{reading.note}</p>
  {/if}
{/snippet}

<style>
  :global(body) {
    margin: 0;
    background: #faf8f4;
    color: #202020;
    font-family: "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif;
    min-height: 100vh;
    overflow-x: hidden;
  }

  .readings-page {
    max-width: 560px;
    margin: 0 auto;
    padding: 4.5rem 1.6rem 5rem;
    font-size: 0.86rem;
    line-height: 1.9;
  }

  h1 {
    font-weight: 500;
    font-size: 1.45rem;
    letter-spacing: 0.01em;
    margin: 0 0 0.35rem;
  }

  .intro {
    margin: 0 0 2.2rem;
    color: #6f6f6f;
  }

  .readings {
    display: grid;
    gap: 1.45rem;
  }

  .reading {
    display: block;
    text-decoration: none;
    color: inherit;
    border-top: 1px solid rgba(207, 207, 207, 0.6);
    padding-top: 1rem;
    transition: transform 120ms ease;
  }

  a.reading:hover {
    transform: translateX(2px);
  }

  .meta {
    margin: 0;
    color: #8f8f8f;
    font-size: 0.72rem;
    letter-spacing: 0.04em;
  }

  h2 {
    margin: 0.15rem 0 0.38rem;
    font-size: 1rem;
    font-weight: 500;
    font-style: italic;
  }

  .author,
  .note {
    margin: 0;
    color: #595959;
  }

  .note {
    margin-top: 0.35rem;
  }

  @media (max-width: 700px) {
    .readings-page {
      padding: 1.15rem 1.25rem 3.5rem;
      font-size: 0.9rem;
    }
  }
</style>
