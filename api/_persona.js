import { createHash } from "node:crypto";

export function loadPersonaFromEnv() {
  const identity = (process.env.OPENCLAW_IDENTITY_MD || "").trim();
  const soul = (process.env.OPENCLAW_SOUL_MD || "").trim();
  const style = (process.env.OPENCLAW_STYLE_MD || "").trim();
  const memory = (process.env.OPENCLAW_MEMORY_MD || "").trim();

  return {
    identity,
    soul,
    style,
    memory,
    connected: {
      identity: Boolean(identity),
      soul: Boolean(soul),
      style: Boolean(style),
      memory: Boolean(memory),
    },
  };
}

export function personaMetadata(persona = loadPersonaFromEnv()) {
  return {
    identity: sectionMetadata(persona.identity),
    soul: sectionMetadata(persona.soul),
    style: sectionMetadata(persona.style),
    memory: sectionMetadata(persona.memory),
  };
}

export function personaInstructionBlock() {
  const persona = loadPersonaFromEnv();
  const sections = [
    persona.soul && `SOUL.md\n${persona.soul}`,
    persona.identity && `IDENTITY.md\n${persona.identity}`,
    persona.style && `STYLE.md\n${persona.style}`,
    persona.memory && `MEMORY.md\n${persona.memory}`,
  ].filter(Boolean);

  if (sections.length === 0) return "";

  return [
    "Use the following OpenClaw persona/style/memory context as private grounding. Do not recite it unless the user explicitly asks. Let it shape your voice, taste, memory, and artifact decisions.",
    sections.join("\n\n---\n\n"),
  ].join("\n\n");
}

function sectionMetadata(value = "") {
  const text = String(value || "");
  return {
    chars: text.length,
    hash: text ? createHash("sha256").update(text).digest("hex").slice(0, 12) : "",
  };
}
