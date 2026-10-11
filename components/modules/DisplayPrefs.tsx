"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/** Theme + font size preferences (stored per browser). */
export function DisplayPrefs() {
  const [dark, setDark] = useState(false);
  const [font, setFont] = useState("md");
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    setFont(document.documentElement.dataset.font ?? "md");
  }, []);
  const save = (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  };
  const setTheme = (d: boolean) => {
    document.documentElement.classList.toggle("dark", d);
    save("sd-theme", d ? "dark" : "light");
    setDark(d);
  };
  const setSize = (f: string) => {
    if (f === "md") delete document.documentElement.dataset.font;
    else document.documentElement.dataset.font = f;
    save("sd-font", f === "md" ? "" : f);
    setFont(f);
  };
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div>
        <p className="sd-label">Tema</p>
        <div className="flex gap-2">
          <button type="button" className={`sd-btn ${!dark ? "primary" : ""}`} onClick={() => setTheme(false)}><Sun className="size-4" /> Terang</button>
          <button type="button" className={`sd-btn ${dark ? "primary" : ""}`} onClick={() => setTheme(true)}><Moon className="size-4" /> Gelap</button>
        </div>
      </div>
      <div>
        <p className="sd-label">Ukuran font</p>
        <div className="flex gap-2">
          {[["sm", "Kecil"], ["md", "Normal"], ["lg", "Besar"]].map(([k, l]) => (
            <button key={k} type="button" className={`sd-btn ${font === k ? "primary" : ""}`} onClick={() => setSize(k)}>{l}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
