import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

function renderDialog(onConfirm = vi.fn(), onCancel = vi.fn()) {
  render(
    <ConfirmDialog
      open
      title="Delete this recipe?"
      message="This can't be undone."
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { onConfirm, onCancel };
}

describe("ConfirmDialog", () => {
  it("renders nothing when closed", () => {
    render(
      <ConfirmDialog
        open={false}
        title="Delete this recipe?"
        message="This can't be undone."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByText("Delete this recipe?")).not.toBeInTheDocument();
  });

  it("shows the title/message and focuses Cancel when open", () => {
    renderDialog();

    expect(screen.getByText("Delete this recipe?")).toBeInTheDocument();
    expect(screen.getByText("This can't be undone.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("calls onCancel when Cancel is clicked", () => {
    const { onCancel } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onConfirm when the confirm button is clicked", () => {
    const { onConfirm } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when the backdrop is clicked", () => {
    const { onCancel } = renderDialog();

    // A click lands on the <dialog> element itself (rather than one of its
    // content descendants) exactly when it's on the backdrop area.
    fireEvent.click(screen.getByRole("alertdialog"));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does not call onCancel when content inside the dialog is clicked", () => {
    const { onCancel } = renderDialog();

    fireEvent.click(screen.getByText("This can't be undone."));

    expect(onCancel).not.toHaveBeenCalled();
  });

  it("calls onCancel when the native Escape/cancel event fires", () => {
    const { onCancel } = renderDialog();

    // Real browsers fire a cancelable "cancel" event on the dialog when
    // Escape is pressed while it's modal — jsdom doesn't simulate that from
    // a raw keydown, so the event is dispatched directly to exercise the
    // same listener a real Escape press would trigger.
    fireEvent(screen.getByRole("alertdialog"), new Event("cancel", { cancelable: true }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
