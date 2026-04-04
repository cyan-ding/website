<script lang="ts">
  import { quotes } from "$lib/quotes";
</script>

<main class="quotes-page">
  <header>
    <h1>Quotes</h1>
  </header>

  <section class="quotes" aria-label="Quotes">
    {#each quotes as quote}
      <blockquote class="quote-card">
        <p class="quote-text">{quote.text}</p>
        <footer class="quote-attr">
          <span class="author">{quote.author}</span>
          {#if quote.source}
            <span class="source">{quote.source}</span>
          {/if}
        </footer>
      </blockquote>
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

  .quotes-page {
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

  .quotes {
    display: grid;
    gap: 1.8rem;
  }

  .quote-card {
    margin: 0;
    padding: 0 0 0 1.1rem;
    border-left: 2px solid rgba(180, 160, 150, 0.4);
  }

  .quote-text {
    margin: 0 0 0.5rem;
    color: #363636;
    font-style: italic;
  }

  .quote-attr {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    font-size: 0.76rem;
    color: #8a8a8a;
    letter-spacing: 0.02em;
  }

  .author::before {
    content: "— ";
  }

  .source {
    font-style: italic;
    opacity: 0.8;
  }

  @media (max-width: 640px) {
    .quotes-page {
      padding: 3rem 1.2rem 4rem;
    }
  }
</style>
