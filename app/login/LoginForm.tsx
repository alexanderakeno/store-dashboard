"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";

/** "Selamat pagi/siang/sore/malam" by the store's clock (WIB). */
function greeting(now = new Date()): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta" }).format(now));
  return h < 11 ? "Selamat pagi" : h < 15 ? "Selamat siang" : h < 18 ? "Selamat sore" : "Selamat malam";
}

/** "ADI MUHAMAD RIZKI" → "Adi". */
const firstName = (name: string) => {
  const w = name.trim().split(/\s+/)[0] ?? "";
  return w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : "";
};

function Form() {
  const router = useRouter();
  const sp = useSearchParams();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [hello, setHello] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const shake = () => {
    const card = box.current?.closest(".card");
    if (!card) return;
    card.classList.remove("login-shake");
    void (card as HTMLElement).offsetWidth; // restart the animation
    card.classList.add("login-shake");
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nik: fd.get("nik"), password: fd.get("password") }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Login gagal");
      // greeting + progress ring while the dashboard loads (no extra wait: navigation starts right away)
      const name = firstName(String(j.name ?? ""));
      setHello(`${greeting()}${name ? `, ${name}` : ""}`);
      box.current?.closest(".login")?.classList.add("login-welcome");
      const next = sp.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/home");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
      shake();
    }
  };

  return (
    <div className="login-box" ref={box}>
      <form className={`stack login-form${hello ? " is-hidden" : ""}`} onSubmit={onSubmit} aria-hidden={!!hello}>
        <label className="field">
          NIK
          <input name="nik" type="text" inputMode="numeric" autoComplete="username" required autoFocus />
        </label>
        <label className="field">
          Password
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {error && <div className="alert error small" role="alert">{error}</div>}
        <button className="btn primary" type="submit" disabled={busy} style={{ justifyContent: "center" }}>
          {busy ? (
            <>
              <span className="login-spin" aria-hidden /> Memeriksa…
            </>
          ) : (
            "Masuk"
          )}
        </button>
      </form>
      {hello && (
        <div className="login-greet" role="status" aria-live="polite">
          <svg className="login-ring" viewBox="0 0 72 72" aria-hidden>
            <circle className="t" cx="36" cy="36" r="30" />
            <circle className="p" cx="36" cy="36" r="30" />
          </svg>
          <p className="login-greet-title">{hello}</p>
          <p className="login-greet-sub">Menyiapkan dashboard…</p>
        </div>
      )}
    </div>
  );
}

export function LoginForm() {
  return (
    <Suspense>
      <Form />
    </Suspense>
  );
}
