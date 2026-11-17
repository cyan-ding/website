import { dev } from "$app/environment";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Local-only markdown editing API.
 *
 * This endpoint MUST NOT exist in production:
 * - `dev` is a build-time constant from $app/environment — it is `true` only
 *   under `vite dev` and is compiled to `false` for `vite build`/`preview`,
 *   so every handler below immediately 404s on a production server (and the
 *   client-side editor is never rendered there either).
 * - As defence in depth we also refuse non-loopback hosts in case the dev
 *   server is ever exposed with --host.
 */
function assertLocalDev(event: Parameters<RequestHandler>[0]) {
  if (!dev) error(404, "Not found");
  const host = event.url.hostname;
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
    error(404, "Not found");
  }
}

const KIND_DIRS: Record<string, string> = {
  blog: "src/lib/posts",
  portfolio: "src/lib/portfolio"
};

const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function fileFor(kind: string, slug: string): string {
  const dir = KIND_DIRS[kind];
  if (!dir || !SLUG_RE.test(slug)) error(404, "Not found");
  const root = path.resolve(process.cwd(), dir);
  const file = path.resolve(root, `${slug}.md`);
  // Belt-and-braces: the resolved file must stay inside the content dir.
  if (!file.startsWith(root + path.sep)) error(404, "Not found");
  return file;
}

type Frontmatter = { title: string; date: string; summary: string };

function parseFrontmatter(raw: string): { data: Frontmatter; content: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { data: { title: "", date: "", summary: "" }, content: raw.trim() };
  }
  const data: Frontmatter = { title: "", date: "", summary: "" };
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key === "title" || key === "date" || key === "summary") data[key] = val;
  }
  return { data, content: match[2].trim() };
}

function serialize({ title, date, summary }: Frontmatter, content: string): string {
  const oneLine = (v: string) => v.replace(/\s*\n\s*/g, " ").trim();
  return (
    `---\n` +
    `title: ${oneLine(title)}\n` +
    `date: ${oneLine(date)}\n` +
    `summary: ${oneLine(summary)}\n` +
    `---\n\n` +
    `${content.trim()}\n`
  );
}

export const GET: RequestHandler = async (event) => {
  assertLocalDev(event);
  const file = fileFor(event.params.kind, event.params.slug);
  let raw: string;
  try {
    raw = await readFile(file, "utf-8");
  } catch {
    error(404, "Not found");
  }
  const { data, content } = parseFrontmatter(raw);
  return json({ slug: event.params.slug, kind: event.params.kind, ...data, content });
};

export const PUT: RequestHandler = async (event) => {
  assertLocalDev(event);
  const file = fileFor(event.params.kind, event.params.slug);

  let body: unknown;
  try {
    body = await event.request.json();
  } catch {
    error(400, "Invalid JSON");
  }
  const { title, date, summary, content } = (body ?? {}) as Record<string, unknown>;
  if (
    typeof title !== "string" ||
    typeof date !== "string" ||
    typeof summary !== "string" ||
    typeof content !== "string"
  ) {
    error(400, "Expected { title, date, summary, content } strings");
  }
  if (content.length > 1_000_000) error(413, "Content too large");

  await writeFile(file, serialize({ title, date, summary }, content), "utf-8");
  return json({ ok: true, slug: event.params.slug, kind: event.params.kind, title, date, summary, content: content.trim() });
};
