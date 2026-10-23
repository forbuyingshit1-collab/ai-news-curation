"use client";

import { FormEvent, useState } from "react";
import { LockKeyhole, LoaderCircle } from "lucide-react";

export function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      if (!response.ok) throw new Error("รหัสผ่านไม่ถูกต้อง");
      window.location.assign("/");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <form className="login-panel" onSubmit={submit}>
        <input autoComplete="username" aria-hidden="true" className="login-username" name="username" tabIndex={-1} value="owner" readOnly />
        <span className="login-icon"><LockKeyhole size={20} /></span>
        <div><h1>AI News</h1><p>Editorial workspace</p></div>
        <label htmlFor="password">รหัสผ่าน</label>
        <input id="password" autoComplete="current-password" autoFocus onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
        {error ? <p className="login-error" role="alert">{error}</p> : null}
        <button disabled={busy} type="submit">{busy ? <LoaderCircle className="spin" size={16} /> : null}เข้าสู่ระบบ</button>
      </form>
    </main>
  );
}
