import { createFileRoute } from "@tanstack/react-router";

// Placeholder home; Task 8 builds the library here.
export const Route = createFileRoute("/_app/")({
  component: () => <h1 className="p-6 text-4xl">Library</h1>,
});
