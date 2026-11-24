import { QueryClient } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App, createAppRouter } from "./router";
import "./styles/index.css";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");

const queryClient = new QueryClient();
const router = createAppRouter({ queryClient });

createRoot(root).render(
  <StrictMode>
    <App router={router} queryClient={queryClient} />
  </StrictMode>,
);
