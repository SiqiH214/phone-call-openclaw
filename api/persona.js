import { loadPersonaFromEnv, personaMetadata } from "./_persona.js";

export default function handler(_req, res) {
  const persona = loadPersonaFromEnv();
  res.status(200).json({
    ok: true,
    connected: persona.connected,
    metadata: personaMetadata(persona),
  });
}
