export default async function handler(req, res) {
  res.redirect(302, req.query?.url || "/");
}
