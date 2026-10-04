import React, { useState } from "react";
import { supabase } from "../lib/supabaseClient.js";

// Écran de connexion / inscription (Supabase Auth email + mot de passe)
export default function AuthScreen() {
  const [mode, setMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    setErr(""); setMsg(""); setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        // la session déclenche le listener dans App -> bascule automatique
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (data?.user && !data.session) {
          setMsg("Compte créé ! Vérifie ta boîte mail pour confirmer, puis connecte-toi.");
          setMode("login");
        }
      }
    } catch (e2) {
      setErr(traduire(e2?.message || "Erreur inconnue"));
    } finally { setBusy(false); }
  }

  function traduire(m) {
    if (/invalid login credentials/i.test(m)) return "Email ou mot de passe incorrect.";
    if (/already registered/i.test(m)) return "Cet email a déjà un compte — connecte-toi.";
    if (/password should be at least/i.test(m)) return "Mot de passe trop court (6 caractères minimum).";
    if (/email not confirmed/i.test(m)) return "Email non confirmé — vérifie ta boîte mail.";
    return m;
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">📚</div>
        <h1 className="auth-title">Ma Bibliothèque BD</h1>
        <p className="auth-sub">{mode === "login" ? "Connecte-toi à ta collection" : "Crée ton compte"}</p>

        <form onSubmit={submit} className="auth-form">
          <label className="auth-field">
            <span>Email</span>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required placeholder="toi@exemple.fr" />
          </label>
          <label className="auth-field">
            <span>Mot de passe</span>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} required placeholder="••••••••" />
          </label>

          {err && <div className="auth-error">{err}</div>}
          {msg && <div className="auth-msg">{msg}</div>}

          <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
            {busy ? "…" : (mode === "login" ? "Se connecter" : "Créer mon compte")}
          </button>
        </form>

        <div className="auth-switch">
          {mode === "login"
            ? <>Pas encore de compte ? <button className="auth-link" onClick={() => { setMode("signup"); setErr(""); setMsg(""); }}>Créer un compte</button></>
            : <>Déjà un compte ? <button className="auth-link" onClick={() => { setMode("login"); setErr(""); setMsg(""); }}>Se connecter</button></>}
        </div>
      </div>
    </div>
  );
}
