import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");

createRoot(root).render(
  <StrictMode>
    <h1 className="p-6 text-3xl">nosh</h1>
  </StrictMode>,
);
