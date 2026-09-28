import { error } from "@sveltejs/kit";
import type { PageLoad } from "./$types";
import { getEntryBySlug } from "$lib/portfolio";

export const load: PageLoad = ({ params }) => {
  const entry = getEntryBySlug(params.slug);

  if (!entry) {
    error(404, "Entry not found");
  }

  return { entry };
};
