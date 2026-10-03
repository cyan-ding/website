<script lang="ts">
  import { afterNavigate } from "$app/navigation";
  import { page } from "$app/stores";

  let { children } = $props();

  afterNavigate((navigation) => {
    if (navigation.type === "popstate") return;
    const path = navigation.to?.url.pathname ?? "";
    if (!path.startsWith("/blog/")) return;

    const toTop = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    toTop();
    requestAnimationFrame(toTop);
  });

  const navItems = [
    { href: "/", label: "blog" },
    { href: "/portfolio", label: "portfolio" },
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

  @media (max-width: 700px) {
    .site-nav {
      position: relative;
      flex-wrap: wrap;
      justify-content: flex-end;
      padding: 0.9rem 1.2rem 0.15rem;
      padding-top: max(0.9rem, env(safe-area-inset-top));
      padding-right: max(1.2rem, env(safe-area-inset-right));
      padding-left: max(1.2rem, env(safe-area-inset-left));
      gap: 0.7rem 1rem;
    }

    .nav-link {
      font-size: 0.7rem;
      letter-spacing: 0.08em;
    }
  }
</style>
