import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerServiceWorker } from "./lib/push";

createRoot(document.getElementById("root")!).render(<App />);

if (import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void registerServiceWorker();
  });
}
