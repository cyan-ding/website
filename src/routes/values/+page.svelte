<script lang="ts">
  import { values } from "$lib/values";
</script>

<main class="values-page">
  <header>
    <h1>Values</h1>
    <p class="intro">What I hold closest to heart.</p>
  </header>

  <section class="values" aria-label="Core values">
    {#each values as value}
      <article class="value-card">
        <h2>{value.title}</h2>
        <p>{value.description}</p>
      </article>
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

  .values-page {
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

  .values {
    display: grid;
    gap: 1.65rem;
  }

  .value-card {
    padding-top: 1rem;
    border-top: 1px solid rgba(207, 207, 207, 0.6);
  }

  h2 {
    margin: 0 0 0.35rem;
    font-size: 1rem;
    font-weight: 500;
  }

  .value-card p {
    margin: 0;
    color: #595959;
  }

  @media (max-width: 640px) {
    .values-page {
      padding: 3rem 1.2rem 4rem;
    }
  }
</style>
