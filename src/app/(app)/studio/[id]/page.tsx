import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { PostEditor } from "@/components/post-editor";
import { getPost } from "@/lib/posts/queries";
import { requireUser } from "@/lib/supabase/session";

export const metadata: Metadata = { title: "Edit post" };

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, profile } = await requireUser();
  const post = await getPost(supabase, user.id, id);
  if (!post) notFound();
  return (
    <>
      <PageHeader title="Edit post" />
      <PostEditor key={post.updated_at} post={post} timezone={profile.timezone} displayName={profile.display_name ?? "You"} />
    </>
  );
}
