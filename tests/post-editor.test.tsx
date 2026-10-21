import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PostEditor } from "@/components/post-editor";
import { ToastProvider } from "@/components/ui/toast";

const savePost = vi.fn();
const refresh = vi.fn();
vi.mock("@/lib/posts/actions", () => ({ savePost: (...a: unknown[]) => savePost(...a), deletePost: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh }) }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ upload: vi.fn().mockResolvedValue({ error: null }), remove: vi.fn() }) } }),
}));

const USER = "11111111-1111-4111-8111-111111111111";
const POST_ID = "00000000-0000-4000-8000-000000000001";

type EditorProps = Parameters<typeof PostEditor>[0];
function setup(props: Partial<EditorProps> = {}) {
  return render(
    <ToastProvider>
      <PostEditor mode="create" post={null} timezone="Asia/Jakarta" displayName="Ayu" userId={USER} threadsReady {...props} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  savePost.mockReset();
  refresh.mockReset();
});

describe("PostEditor", () => {
  it("updates the live counter and preview as you type", async () => {
    setup();
    await userEvent.type(screen.getByLabelText("Post text"), "Hello");
    expect(screen.getByText(/5 \/ 500/)).toBeInTheDocument();
    expect(screen.getAllByText("Hello").length).toBeGreaterThan(0);
  });

  it("blocks saving and scheduling when over the limit", () => {
    setup({ mode: "edit", post: { id: POST_ID, content: "a".repeat(501), status: "draft", scheduled_at: null, failure_reason: null } });
    expect(screen.getByText(/501 \/ 500/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save draft/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /schedule post/i })).toBeDisabled();
  });

  it("disables editing for published posts", () => {
    setup({ mode: "edit", post: { id: POST_ID, content: "Live", status: "published", scheduled_at: "2026-10-01T00:00:00Z", failure_reason: null } });
    expect(screen.getByLabelText("Post text")).toBeDisabled();
    expect(screen.getByRole("button", { name: /save draft/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /add images/i })).toBeDisabled();
  });

  it("sends a draft save to the server action", async () => {
    savePost.mockResolvedValue({ ok: true, message: "Draft saved.", data: { id: POST_ID } });
    setup();
    await userEvent.type(screen.getByLabelText("Post text"), "Idea");
    await userEvent.click(screen.getByRole("button", { name: /save draft/i }));
    expect(savePost).toHaveBeenCalledWith(expect.objectContaining({ content: "Idea", intent: "draft", timezone: "Asia/Jakarta", media: [] }));
  });

  it("resets every field in the Content Studio after saving a draft", async () => {
    savePost.mockResolvedValue({ ok: true, message: "Draft saved.", data: { id: POST_ID } });
    setup();
    const text = screen.getByLabelText("Post text");
    await userEvent.type(text, "Idea");
    await userEvent.click(screen.getByRole("button", { name: /save draft/i }));
    await waitFor(() => expect(text).toHaveValue(""));
    expect(screen.getByText(/0 \/ 500/)).toBeInTheDocument();
  });

  it("keeps the input when saving fails", async () => {
    savePost.mockResolvedValue({ ok: false, error: "Could not save the post. Try again." });
    setup();
    const text = screen.getByLabelText("Post text");
    await userEvent.type(text, "Idea");
    await userEvent.click(screen.getByRole("button", { name: /save draft/i }));
    await waitFor(() => expect(savePost).toHaveBeenCalled());
    expect(text).toHaveValue("Idea");
  });

  it("calls onDone instead of resetting in edit mode", async () => {
    savePost.mockResolvedValue({ ok: true, message: "Draft saved.", data: { id: POST_ID } });
    const onDone = vi.fn();
    setup({ mode: "edit", onDone, post: { id: POST_ID, content: "Keep me", status: "draft", scheduled_at: null, failure_reason: null } });
    await userEvent.click(screen.getByRole("button", { name: /save draft/i }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(screen.getByLabelText("Post text")).toHaveValue("Keep me");
  });

  it("disables scheduling and explains why when Threads is not connected", () => {
    setup({ threadsReady: false });
    expect(screen.getByRole("button", { name: /schedule post/i })).toBeDisabled();
    expect(screen.getByRole("link", { name: /settings/i })).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("button", { name: /save draft/i })).toBeEnabled();
  });

  it("rejects unsupported image types without uploading", async () => {
    setup();
    const input = screen.getByLabelText("Choose images");
    await userEvent.upload(input, new File(["x"], "anim.gif", { type: "image/gif" }), { applyAccept: false });
    expect(await screen.findByText(/only JPEG and PNG/i)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /attached images/i })).not.toBeInTheDocument();
  });
});
