export type PortfolioEntry = {
  slug: string;
  title: string;
  date: string;
  summary: string;
  content: string;
};

function parseFrontmatter(raw: string): { data: Record<string, string>; content: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { data: {}, content: raw.trim() };

  const data: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    data[key] = val;
  }

  return { data, content: match[2].trim() };
}

const mdFiles = import.meta.glob("./portfolio/*.md", {
  eager: true,
  query: "?raw",
  import: "default"
}) as Record<string, string>;

export const entries: PortfolioEntry[] = Object.entries(mdFiles)
  .map(([path, raw]) => {
    const slug = path.replace("./portfolio/", "").replace(".md", "");
    const { data, content } = parseFrontmatter(raw);
    return {
      slug,
      title: data.title ?? slug,
      date: data.date ?? "",
      summary: data.summary ?? "",
      content
    };
  })
  .sort((a, b) => (a.date > b.date ? -1 : 1));

export function getEntryBySlug(slug: string): PortfolioEntry | undefined {
  return entries.find((entry) => entry.slug === slug);
}
