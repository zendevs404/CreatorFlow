import { redirect } from "next/navigation";

/** Editing now happens in a modal on the Posts page. Old links keep working. */
export default async function EditRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/posts?edit=${encodeURIComponent(id)}`);
}
