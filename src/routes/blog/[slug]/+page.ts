import { error } from "@sveltejs/kit";
import type { PageLoad } from "./$types";
import { getPostBySlug } from "$lib/posts";

export const load: PageLoad = ({ params }) => {
  const post = getPostBySlug(params.slug);

  if (!post) {
    error(404, "Post not found");
  }

  return { post };
};
