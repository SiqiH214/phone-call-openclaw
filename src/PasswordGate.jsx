import React, { useState } from "react";

const STORAGE_KEY = "phone-call-openclaw-unlock:v1";
const PASSWORD = "siqihe1234";

export function PasswordGate({ children }) {
  const [unlocked, setUnlocked] = useState(() => {
    try {
      return window.sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  if (unlocked) return children;

  function submit(event) {
    event.preventDefault();
    if (value === PASSWORD) {
      try { window.sessionStorage.setItem(STORAGE_KEY, "1"); } catch {}
      setUnlocked(true);
    } else {
      setError(true);
      setValue("");
    }
  }

  return (
    <div style={styles.wrap}>
      <form onSubmit={submit} style={styles.card}>
        <div style={styles.title}>47</div>
        <div style={styles.label}>enter password</div>
        <input
          autoFocus
          type="password"
          value={value}
          onChange={(event) => { setValue(event.target.value); setError(false); }}
          style={{ ...styles.input, borderColor: error ? "#ff4c62" : "#333" }}
          placeholder="••••••••"
        />
        <button type="submit" style={styles.button}>unlock</button>
        {error && <div style={styles.error}>wrong password</div>}
      </form>
    </div>
  );
}

const styles = {
  wrap: {
    minHeight: "100vh",
    background: "#0d0d0d",
    color: "#fcfaf7",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    padding: "24px",
  },
  card: {
    width: "100%",
    maxWidth: 320,
    display: "flex",
    flexDirection: "column",
    gap: 14,
    padding: "32px 28px",
    background: "#161616",
    borderRadius: 18,
    border: "1px solid #232323",
  },
  title: {
    fontSize: 32,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    textAlign: "center",
    marginBottom: 4,
  },
  label: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "#888",
    textAlign: "center",
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    fontSize: 16,
    background: "#0d0d0d",
    color: "#fcfaf7",
    border: "1px solid #333",
    borderRadius: 10,
    outline: "none",
  },
  button: {
    width: "100%",
    padding: "12px 14px",
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    background: "#fcfaf7",
    color: "#0d0d0d",
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
  },
  error: {
    fontSize: 13,
    color: "#ff4c62",
    textAlign: "center",
  },
};
