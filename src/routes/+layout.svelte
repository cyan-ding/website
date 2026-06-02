<script lang="ts">
  import { page } from "$app/stores";

  let { children } = $props();

  const navItems = [
    { href: "/", label: "blog" },
    { href: "/quotes", label: "quotes" },
    { href: "/values", label: "values" },
  ];
</script>

<nav class="site-nav">
  {#each navItems as item}
    <a
      class="nav-link"
      href={item.href}
      class:active={$page.url.pathname === item.href ||
        (item.href !== "/" && $page.url.pathname.startsWith(item.href))}
    >
      {item.label}
    </a>
  {/each}
</nav>

{@render children()}

<style>
  .site-nav {
    position: fixed;
    top: 0;
    right: 0;
    z-index: 10;
    display: flex;
    gap: 1.6rem;
    padding: 1.4rem 2rem;
  }

  .nav-link {
    text-decoration: none;
    color: #999;
    font-family: "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif;
    font-size: 0.78rem;
    letter-spacing: 0.12em;
    transition: color 180ms ease;
  }

  .nav-link:hover {
    color: #444;
  }

  .nav-link.active {
    color: #333;
  }

  @media (max-width: 640px) {
    .site-nav {
      padding: 1rem 1.2rem;
      gap: 1.2rem;
    }
  }
</style>
