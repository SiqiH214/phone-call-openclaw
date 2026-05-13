import crypto from "node:crypto";

const cookieName = "call_agent_auth";
const maxAgeSeconds = 60 * 60 * 24 * 30;

export function authStatus(req) {
  const password = sitePassword();
  if (!password) return { requiresAuth: false, unlocked: true };
  return { requiresAuth: true, unlocked: isAuthenticated(req) };
}

export function isAuthenticated(req) {
  const password = sitePassword();
  if (!password) return true;
  return readCookie(req, cookieName) === authToken(password);
}

export function requireAuth(req, res) {
  if (isAuthenticated(req)) return true;
  res.status(401).json({ ok: false, error: "Password required." });
  return false;
}

export function loginWithPassword(req, res, password) {
  const expected = sitePassword();
  if (!expected) {
    res.status(200).json({ ok: true, requiresAuth: false, unlocked: true });
    return;
  }

  if (String(password || "") !== expected) {
    res.status(401).json({ ok: false, requiresAuth: true, unlocked: false, error: "Wrong password." });
    return;
  }

  setCookie(res, cookieName, authToken(expected), { maxAge: maxAgeSeconds });
  res.status(200).json({ ok: true, requiresAuth: true, unlocked: true });
}

export function logout(req, res) {
  setCookie(res, cookieName, "", { maxAge: 0 });
  res.status(200).json({ ok: true, ...authStatus(req), unlocked: false });
}

function sitePassword() {
  return String(process.env.SITE_PASSWORD || "").trim();
}

function authToken(password) {
  return crypto.createHash("sha256").update(`call-agent:${password}`).digest("hex");
}

function readCookie(req, name) {
  const header = req.headers?.cookie || "";
  const cookies = String(header).split(";").map((part) => part.trim()).filter(Boolean);
  for (const cookie of cookies) {
    const [key, ...value] = cookie.split("=");
    if (key === name) return decodeURIComponent(value.join("=") || "");
  }
  return "";
}

function setCookie(res, name, value, { maxAge }) {
  const secure = process.env.NODE_ENV === "production" || process.env.VERCEL === "1" ? "; Secure" : "";
  res.setHeader("Set-Cookie", [
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`,
  ]);
}
