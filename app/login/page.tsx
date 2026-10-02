import Image from "next/image";
import { appConfig, configProblems } from "@/config/app";
import { LoginForm } from "./LoginForm";
import team from "./team.jpg";

export const dynamic = "force-dynamic";

/**
 * Login: team photo + form. The photo is shown with object-fit: contain over a
 * blurred copy of itself, so nobody in the photo is ever cropped at any screen size.
 * Mobile: photo on top, form below. Desktop: photo left, form right.
 */
export default function LoginPage() {
  const cfg = appConfig();
  const problems = configProblems(cfg);
  return (
    <div className="login">
      <div className="login-photo" aria-hidden>
        <Image src={team} alt="" fill sizes="(min-width: 900px) calc(100vw - 440px), 100vw" className="login-photo-blur" priority placeholder="blur" />
        <Image src={team} alt="" fill sizes="(min-width: 900px) calc(100vw - 440px), 100vw" className="login-photo-main" priority />
      </div>
      <div className="login-panel">
        <div className="card stack">
          <div>
            <h1>{cfg.storeName || cfg.appName}</h1>
            <div className="small muted">Masuk dengan NIK dan password</div>
          </div>
          {problems.length > 0 && (
            <div className="alert error small">
              <b>Konfigurasi belum lengkap:</b>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{problems.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          )}
          <LoginForm />
          <p className="login-credit">© 2026 · Dibuat oleh <b>Alexander Akeno</b></p>
        </div>
      </div>
    </div>
  );
}
