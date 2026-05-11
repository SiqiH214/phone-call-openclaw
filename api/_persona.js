export function loadPersonaFromEnv() {
  const identity = (process.env.OPENCLAW_IDENTITY_MD || "").trim();
  const soul = (process.env.OPENCLAW_SOUL_MD || "").trim();
  const memory = (process.env.OPENCLAW_MEMORY_MD || "").trim();

  return {
    identity,
    soul,
    memory,
    connected: {
      identity: Boolean(identity),
      soul: Boolean(soul),
      memory: Boolean(memory),
    },
  };
}

export function personaInstructionBlock() {
  const persona = loadPersonaFromEnv();
  const sections = [
    persona.soul && `SOUL.md\n${persona.soul}`,
    persona.identity && `IDENTITY.md\n${persona.identity}`,
    persona.memory && `MEMORY.md\n${persona.memory}`,
  ].filter(Boolean);

  if (sections.length === 0) return "";

  return [
    "Use the following OpenClaw persona/memory context as private grounding. Do not recite it unless the user explicitly asks. Let it shape your voice, taste, memory, and artifact decisions.",
    sections.join("\n\n---\n\n"),
  ].join("\n\n");
}
