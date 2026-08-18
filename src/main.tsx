import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { watchServiceWorkerUpdates } from "./lib/swUpdates";

watchServiceWorkerUpdates();

createRoot(document.getElementById("root")!).render(<App />);
