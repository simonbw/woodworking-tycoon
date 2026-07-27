import React from "react";
import { createRoot } from "react-dom/client";
import "./pixi-setup";
import { Main } from "./components/Main";
import { loadAssets } from "./utils/loadAssets";
import { loadFonts } from "./utils/loadFonts";
import { preloadUiImages } from "./utils/uiImages";
// Load test fixtures for testing and debugging
import "../tests/fixtures";

const reactContainer = document.getElementById("react-container");
if (!reactContainer) {
  throw new Error("No react-container found");
}

const root = createRoot(reactContainer);

// Load all PIXI assets and every font face before rendering the app, so the
// first frame doesn't get re-laid-out as type trickles in
Promise.all([loadAssets(), loadFonts()]).then(() => {
  root.render(<Main />);
  // The overlays' own images aren't on screen yet, so they warm in the
  // background instead of holding up the first frame
  preloadUiImages();
});

// Live reload
addEventListener("load", () => {
  new EventSource("/esbuild").addEventListener("change", () =>
    location.reload(),
  );
});
