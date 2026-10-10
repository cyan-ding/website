export type ReadingKind = "poem" | "essay" | "book";

export type Reading = {
  title: string;
  author: string;
  kind: ReadingKind;
  year?: number;
  url?: string;
  note?: string;
};

export const readings: Reading[] = [
  {
    title: "If—",
    author: "Rudyard Kipling",
    kind: "poem",
    year: 1910,
    url: "https://www.poetryfoundation.org/poems/46473/if---",
  },
  {
    title: "Letter from Utopia",
    author: "Nick Bostrom",
    kind: "essay",
    year: 2008,
    url: "https://nickbostrom.com/papers/letter-from-utopia/",
  },
];
