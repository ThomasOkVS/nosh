import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useToast } from "./ToastContext";
import { ToastProvider } from "./ToastProvider";

function TriggerButton({ message = "Failed to delete recipe" }: Readonly<{ message?: string }>) {
  const { showToast } = useToast();
  return (
    <button type="button" onClick={() => showToast(message)}>
      Trigger
    </button>
  );
}

function SuccessTriggerButton({ onAction }: Readonly<{ onAction: () => void }>) {
  const { showToast } = useToast();
  return (
    <button
      type="button"
      onClick={() => showToast("Ready to review", { variant: "success", action: { label: "Review", onClick: onAction } })}
    >
      Trigger success
    </button>
  );
}

function renderWithProvider(message?: string) {
  return render(
    <ToastProvider>
      <TriggerButton message={message} />
    </ToastProvider>,
  );
}

describe("ToastProvider", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders no toast until showToast is called", () => {
    renderWithProvider();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a toast with the given message when showToast is called", () => {
    renderWithProvider("Failed to upload image");

    fireEvent.click(screen.getByRole("button", { name: "Trigger" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Failed to upload image");
  });

  it("dismisses a toast when its close button is clicked", () => {
    renderWithProvider();

    fireEvent.click(screen.getByRole("button", { name: "Trigger" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("auto-dismisses a toast after the timeout", () => {
    vi.useFakeTimers();
    renderWithProvider();

    fireEvent.click(screen.getByRole("button", { name: "Trigger" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();

    act(() => {
      vi.runAllTimers();
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("supports multiple simultaneous toasts", () => {
    renderWithProvider("Something went wrong");

    fireEvent.click(screen.getByRole("button", { name: "Trigger" }));
    fireEvent.click(screen.getByRole("button", { name: "Trigger" }));

    expect(screen.getAllByRole("alert")).toHaveLength(2);
  });

  it("runs the action and dismisses when a success toast's action is clicked", () => {
    const onAction = vi.fn();
    render(
      <ToastProvider>
        <SuccessTriggerButton onAction={onAction} />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Trigger success" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Ready to review");

    fireEvent.click(screen.getByRole("button", { name: "Review" }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
