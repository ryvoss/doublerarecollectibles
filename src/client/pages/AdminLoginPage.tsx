import { useState, type FormEvent } from "react";
import "./AdminLoginPage.css";

type AdminLoginPageProps = {
  initialError?: string | null;
  onAuthenticated: () => void;
};

export default function AdminLoginPage({
  initialError = null,
  onAuthenticated,
}: AdminLoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(result?.error ?? "Login failed");
      }
      setPassword("");
      onAuthenticated();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="admin-login-page">
      <div className="admin-login-glow" aria-hidden="true" />
      <section className="admin-login-card" aria-labelledby="admin-login-title">
        <a className="admin-login-brand" href="/" aria-label="Double Rare Collectibles main site">
          <span>DR</span>
          <div>
            <strong>Double Rare Collectibles</strong>
            <small>Business Administration</small>
          </div>
        </a>

        <div className="admin-login-heading">
          <p>SECURE ACCESS</p>
          <h1 id="admin-login-title">Sign in to Admin</h1>
          <span>Use your owner account to manage business data.</span>
        </div>

        <form onSubmit={submit}>
          <label>
            Username
            <input
              autoCapitalize="none"
              autoComplete="username"
              autoFocus
              disabled={submitting}
              maxLength={100}
              onChange={(event) => setUsername(event.target.value)}
              required
              spellCheck={false}
              type="text"
              value={username}
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              disabled={submitting}
              maxLength={256}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          {error && <div className="admin-login-error" role="alert">{error}</div>}

          <button disabled={submitting} type="submit">
            {submitting ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <a className="admin-login-return" href="/">Return to customer site</a>
      </section>
    </main>
  );
}
