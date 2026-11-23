import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

function Placeholder() {
  return <p style={{ fontFamily: "-apple-system, sans-serif", padding: 24 }}>Foodtracker</p>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Placeholder />
  </StrictMode>,
);
