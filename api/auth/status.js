import { authStatus } from "../../server/auth.js";

export default function handler(req, res) {
  res.status(200).json({ ok: true, ...authStatus(req) });
}
