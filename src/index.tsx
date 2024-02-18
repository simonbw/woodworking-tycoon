import React from "react";
import { createRoot } from "react-dom/client";
import { Main } from "./components/Main";

const root = createRoot(document.getElementById("react-container"));
root.render(<Main />);

// Live reload
addEventListener("load", () => {
  new EventSource("/esbuild").addEventListener("change", () =>
    location.reload()
  );
});
