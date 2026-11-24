import { createFileRoute } from "@tanstack/react-router";

// Library placeholder; the recipes plan fills it (design §7 library layout).
export const Route = createFileRoute("/_app/")({
  component: LibraryPage,
});

function LibraryPage() {
  return (
    <div className="px-5 pt-4">
      <h1 className="text-[2.6rem] leading-none">Library</h1>
      <p className="mt-3 text-sm text-muted-foreground">Your recipes will appear here.</p>
    </div>
  );
}
