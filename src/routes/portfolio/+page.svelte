<script lang="ts">
  import { entries } from "$lib/portfolio";
</script>

<main class="portfolio-page">
  <header>
    <h1>Portfolio</h1>
  </header>

  <section class="entries" aria-label="Portfolio entries">
    {#each entries as entry}
      <a class="entry-link" href={`/portfolio/${entry.slug}`}>
        <p class="date">{entry.date}</p>
        <h2>{entry.title}</h2>
        <p class="summary">{entry.summary}</p>
      </a>
    {/each}
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #faf8f4;
    color: #202020;
    font-family: "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif;
    min-height: 100vh;
    overflow-x: hidden;
  }

  .portfolio-page {
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
    margin: 0 0 2.2rem;
  }

  .entries {
    display: grid;
    gap: 1.45rem;
  }

  .entry-link {
    text-decoration: none;
    color: inherit;
    border-top: 1px solid rgba(207, 207, 207, 0.6);
    padding-top: 1rem;
    transition: transform 120ms ease;
  }

  .entry-link:hover {
    transform: translateX(2px);
  }

  .date {
    margin: 0;
    color: #8f8f8f;
    font-size: 0.72rem;
    letter-spacing: 0.04em;
  }

  h2 {
    margin: 0.15rem 0 0.38rem;
    font-size: 1rem;
    font-weight: 500;
  }

  .summary {
    margin: 0;
    color: #595959;
  }

  @media (max-width: 700px) {
    .portfolio-page {
      padding: 1.15rem 1.25rem 3.5rem;
      font-size: 0.9rem;
    }
  }
</style>
