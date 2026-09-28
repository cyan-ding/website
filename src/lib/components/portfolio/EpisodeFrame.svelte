<figure class="figure">
  <!-- svelte-ignore a11y_media_has_caption -->
  <video
    class="episode"
    controls
    playsinline
    preload="metadata"
    src="/actathon/episode.mp4"
  >
    A sim episode of the excavator moving a cone.
  </video>
  <figcaption>Sim episode, world camera. The excavator moves the cone from the red square to the blue square.</figcaption>
</figure>

<style>
  .figure {
    margin: 0.4rem 0 1.5rem;
  }

  .episode {
    display: block;
    width: min(100%, 480px);
    height: auto;
    border-radius: 4px;
    background: #1e1d1b;
  }

  figcaption {
    margin: 0.45rem 0 0;
    color: #8a8a8a;
    font-size: 0.76rem;
    line-height: 1.5;
  }
</style>
