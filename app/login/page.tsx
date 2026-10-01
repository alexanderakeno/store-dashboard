import { appConfig, configProblems } from "@/config/app";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const cfg = appConfig();
  const problems = configProblems(cfg);
  return (
    <div className="login">
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
      </div>
    </div>
  );
}
