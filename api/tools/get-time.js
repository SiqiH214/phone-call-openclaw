export default async function handler(_req, res) {
  res.status(200).json({
    ok: true,
    iso: new Date().toISOString(),
    locale: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
}
