// Hash-based replacement for next/navigation in the single-file build
import { useEffect, useState } from "react";
const read = () => decodeURIComponent(location.hash.replace(/^#/, ""));
export function useRouter() {
  return { push: (p: string) => { const m = p.match(/\/room\/(\w+)/) || p.match(/^\/(train)$/); location.hash = m ? m[1] : ""; if (!m) history.replaceState(null, "", location.pathname + location.search); window.dispatchEvent(new HashChangeEvent("hashchange")); } };
}
export function useParams<T>() {
  const [h, setH] = useState(read());
  useEffect(() => { const f = () => setH(read()); window.addEventListener("hashchange", f); return () => window.removeEventListener("hashchange", f); }, []);
  return { code: h } as unknown as T;
}
