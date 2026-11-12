(window as any).__SB_HASH = true;
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import Home from "../app/page";
import Room from "../app/room/[code]/page";
import Train from "../app/train/page";
function App() {
  const [h, setH] = useState(location.hash.replace(/^#/, ""));
  useEffect(() => { const f = () => setH(location.hash.replace(/^#/, "")); window.addEventListener("hashchange", f); return () => window.removeEventListener("hashchange", f); }, []);
  return h === "train" ? <Train /> : h ? <Room key={h} /> : <Home />;
}
createRoot(document.getElementById("root")!).render(<App />);
