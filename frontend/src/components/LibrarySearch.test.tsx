import { act, fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LibrarySearch } from "./LibrarySearch";

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <p data-testid="location">{pathname + search}</p>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LibrarySearch />
      <LocationProbe />
      <Link to="/collections/2">go to folder 2</Link>
      <Routes>
        <Route path="*" element={null} />
      </Routes>
    </MemoryRouter>,
  );
}

const box = () => screen.getByRole("searchbox", { name: "Search recipes" });
const location = () => screen.getByTestId("location").textContent;

describe("LibrarySearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes a debounced ?q onto the current folder while typing", () => {
    renderAt("/collections/1");

    fireEvent.change(box(), { target: { value: "soup" } });
    expect(location()).toBe("/collections/1");

    act(() => vi.advanceTimersByTime(300));
    expect(location()).toBe("/collections/1?q=soup");
  });

  it("removes ?q when the box is cleared", () => {
    renderAt("/?q=soup");
    expect(box()).toHaveValue("soup");

    fireEvent.change(box(), { target: { value: "" } });
    act(() => vi.advanceTimersByTime(300));

    expect(location()).toBe("/");
  });

  it("jumps to a whole-library search from a non-library page on Enter", () => {
    renderAt("/meal-plan");

    fireEvent.change(box(), { target: { value: "chili" } });
    act(() => vi.advanceTimersByTime(300));
    // Typing alone never navigates away from the page you're on.
    expect(location()).toBe("/meal-plan");

    fireEvent.submit(screen.getByRole("search"));
    expect(location()).toBe("/?q=chili");
  });

  it("follows the URL when it changes from elsewhere (e.g. opening another folder)", () => {
    renderAt("/collections/1?q=soup");
    expect(box()).toHaveValue("soup");

    fireEvent.click(screen.getByRole("link", { name: "go to folder 2" }));

    expect(box()).toHaveValue("");
  });
});
