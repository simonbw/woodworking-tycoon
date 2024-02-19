import React from "react";
import { createRoot } from "react-dom/client";
import { Main } from "./components/Main";

const reactContainer = document.getElementById("react-container");
if (!reactContainer) {
  throw new Error("No react-container found");
}
const root = createRoot(reactContainer);
root.render(<Main />);

// Live reload
addEventListener("load", () => {
  new EventSource("/esbuild").addEventListener("change", () =>
    location.reload()
  );
});
