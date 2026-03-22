<script lang="ts">
  import ParticleVessel from "$lib/components/ParticleVessel.svelte";
  import { posts } from "$lib/posts";
</script>

<ParticleVessel />

<main class="home">
  <header class="hero">
    <h1>A journey of a thousand li</h1>
    <p class="intro">
      Cyan Ding
    </p>
  </header>

  <section class="posts" aria-label="Blog posts">
    {#each posts as post}
      <a class="post-link" href={`/blog/${post.slug}`}>
        <p class="date">{post.date}</p>
        <h2>{post.title}</h2>
        <p class="summary">{post.summary}</p>
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

  .home {
    position: relative;
    max-width: 520px;
    margin: 0;
    margin-left: min(8vw, 120px);
    padding: 4.5rem 1.6rem 5rem;
    font-size: 0.86rem;
    line-height: 1.9;
    z-index: 1;
  }

  .kicker {
    margin: 0;
    color: #8d7c81;
    letter-spacing: 0.18em;
    text-transform: lowercase;
    font-size: 0.7rem;
  }

  h1 {
    margin: 0.32rem 0 0.5rem;
    font-weight: 500;
    letter-spacing: 0.01em;
    font-size: 1.45rem;
  }

  .intro {
    margin: 0;
    color: #5f5f5f;
    max-width: 35ch;
  }

  .posts {
    margin-top: 2.6rem;
    display: grid;
    gap: 1.45rem;
  }

  .post-link {
    text-decoration: none;
    color: inherit;
    border-top: 1px solid rgba(207, 207, 207, 0.6);
    padding-top: 1rem;
    transition: transform 120ms ease;
  }

  .post-link:hover {
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

  @media (max-width: 640px) {
    .home {
      margin-left: 1rem;
      padding: 3rem 1.2rem 4rem;
    }
  }
</style>
