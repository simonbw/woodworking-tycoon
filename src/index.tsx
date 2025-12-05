import React from "react";
import { createRoot } from "react-dom/client";
import "./pixi-setup";
import { Main } from "./components/Main";
import { loadAssets } from "./utils/loadAssets";
// Load test fixtures for testing and debugging
import "../tests/fixtures";

const reactContainer = document.getElementById("react-container");
if (!reactContainer) {
  throw new Error("No react-container found");
}

const root = createRoot(reactContainer);

// Load all PIXI assets before rendering the app
loadAssets().then(() => {
  root.render(<Main />);
});

// Live reload
addEventListener("load", () => {
  new EventSource("/esbuild").addEventListener("change", () =>
    location.reload()
  );
});
