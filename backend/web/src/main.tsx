import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { SessionProvider } from "@/context/SessionContext";
import { App } from "@/App";
import "@/styles/global.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("No se encontró #root en index.html");
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <App />
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
);
