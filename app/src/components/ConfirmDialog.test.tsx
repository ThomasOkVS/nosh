import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

function setup(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const user = userEvent.setup();
  render(
    <ConfirmDialog
      open
      title="Delete this recipe?"
      message="This can't be undone."
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onConfirm, onCancel, user };
}

describe("ConfirmDialog", () => {
  it("REC-39: renders nothing when closed", () => {
    setup({ open: false });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Delete this recipe?")).not.toBeInTheDocument();
  });

  it("REC-39: shows the title and message with focus on Cancel", async () => {
    setup();
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Delete this recipe?");
    expect(dialog).toHaveTextContent("This can't be undone.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus());
  });

  it("REC-39: Cancel calls onCancel only", async () => {
    const { onCancel, onConfirm, user } = setup();
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("REC-39: Escape calls onCancel", async () => {
    const { onCancel, onConfirm, user } = setup();
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("REC-39: a click outside the dialog calls onCancel", async () => {
    const { onCancel, onConfirm, user } = setup();
    await screen.findByRole("alertdialog");
    const backdrop = document.querySelector('[data-slot="alert-dialog-overlay"]');
    expect(backdrop).not.toBeNull();
    await user.click(backdrop as Element);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("REC-39: a click inside the dialog does not cancel", async () => {
    const { onCancel, user } = setup();
    await user.click(await screen.findByText("This can't be undone."));
    await user.click(screen.getByRole("alertdialog"));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("REC-39: only the confirm button confirms, labelled Delete by default", async () => {
    const { onConfirm, onCancel, user } = setup();
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("REC-39: a custom confirm label works", async () => {
    setup({ confirmLabel: "Replace" });
    expect(await screen.findByRole("button", { name: "Replace" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("REC-39: the page behind cannot scroll while open", async () => {
    setup();
    await screen.findByRole("alertdialog");
    const locked =
      document.body.style.overflow === "hidden" ||
      document.documentElement.style.overflow === "hidden" ||
      document.body.hasAttribute("data-base-ui-scroll-locked") ||
      document.documentElement.hasAttribute("data-base-ui-scroll-locked");
    expect(locked).toBe(true);
  });
});
