import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AiAssist } from "@/components/ai-assist";
import { Logo } from "@/components/logo";
import { CountUp } from "@/components/motion";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Dropdown } from "@/components/ui/dropdown";
import { ToastProvider } from "@/components/ui/toast";

vi.mock("@/lib/ai/actions", () => ({ generateSuggestions: vi.fn() }));

const OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
];

describe("Dropdown", () => {
  it("shows the selected label, opens a listbox, and reports the choice", async () => {
    const onValueChange = vi.fn();
    render(<Dropdown aria-label="Filter by status" defaultValue="all" options={OPTIONS} onValueChange={onValueChange} />);
    const trigger = screen.getByRole("combobox", { name: "Filter by status" });
    expect(trigger).toHaveTextContent("All statuses");
    await userEvent.click(trigger);
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: "Published" }));
    expect(onValueChange).toHaveBeenCalledWith("published");
    await waitFor(() => expect(trigger).toHaveTextContent("Published"));
  });

  it("uses the plain modal glass by default and a lightly tinted one when asked", async () => {
    const { unmount } = render(<Dropdown aria-label="Plain" defaultValue="all" options={OPTIONS} />);
    await userEvent.click(screen.getByRole("combobox", { name: "Plain" }));
    expect((await screen.findByRole("listbox")).className).not.toContain("glass-tinted");
    unmount();
    render(<Dropdown tinted aria-label="Tinted" defaultValue="all" options={OPTIONS} />);
    await userEvent.click(screen.getByRole("combobox", { name: "Tinted" }));
    const tinted = (await screen.findByRole("listbox")).className;
    expect(tinted).toContain("glass");
    expect(tinted).toContain("glass-tinted");
  });

  it("supports the keyboard (Enter opens, arrows move, Enter selects)", async () => {
    const onValueChange = vi.fn();
    render(<Dropdown aria-label="Status" defaultValue="all" options={OPTIONS} onValueChange={onValueChange} />);
    screen.getByRole("combobox").focus();
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("listbox");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onValueChange).toHaveBeenCalledWith("draft");
  });

  it("submits its value with the surrounding form, like a native select", () => {
    const { container } = render(
      <form>
        <Dropdown aria-label="Status" name="status" defaultValue="draft" options={OPTIONS} />
      </form>,
    );
    const form = container.querySelector("form");
    expect(form && new FormData(form).get("status")).toBe("draft");
  });
});

describe("Logo", () => {
  it("shows the mark and the Creator Flow wordmark", () => {
    render(<Logo />);
    expect(screen.getByText("Creator Flow")).toBeInTheDocument();
    expect(document.querySelector("img")).toHaveAttribute("alt", "");
  });
  it("names the image when there is no wordmark", () => {
    render(<Logo wordmark={false} />);
    expect(screen.getByRole("img", { name: "Creator Flow" })).toBeInTheDocument();
  });
});

describe("CountUp", () => {
  it("gives assistive technology the final number right away", () => {
    render(<CountUp value={1234} />);
    expect(screen.getByText("1,234")).toHaveClass("sr-only");
  });
});

describe("AI assist panel", () => {
  it("is collapsed until opened, then explains why AI is off", async () => {
    render(
      <ToastProvider>
        <AiAssist enabled={false} reason="AI assistance is off because no key is set." notice={null} draft="" disabled={false} onUse={vi.fn()} />
      </ToastProvider>,
    );
    const toggle = screen.getByRole("button", { name: /ai assist/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/no key is set/)).not.toBeInTheDocument();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText(/no key is set/)).toBeInTheDocument();
  });
});

describe("Dialog layout", () => {
  it("keeps the header outside the scroll area so content never slides under the panel's top edge", () => {
    render(
      <Dialog open>
        <DialogContent title="Edit post" description="Same editor as the studio">
          <p>Body content</p>
        </DialogContent>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog");
    const scroller = dialog.querySelector(".scroll-area");
    expect(scroller).not.toBeNull();
    expect(scroller?.contains(screen.getByText("Body content"))).toBe(true);
    expect(scroller?.contains(screen.getByText("Edit post"))).toBe(false);
    expect(scroller?.contains(screen.getByRole("button", { name: "Close" }))).toBe(false);
    // The glass panel itself must not scroll (that is what put the scrollbar over the rounded corners).
    expect(dialog.className).toContain("overflow-hidden");
    expect(dialog.className).not.toContain("overflow-y-auto");
  });
});
