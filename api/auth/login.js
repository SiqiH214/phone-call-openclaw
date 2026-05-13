import { loginWithPassword } from "../../server/auth.js";

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed." });
    return;
  }

  loginWithPassword(req, res, req.body?.password);
}
