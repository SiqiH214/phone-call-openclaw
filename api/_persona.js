import fs from "node:fs";
import path from "node:path";

function readFileSafe(filePath) {
  if (!filePath) return "";
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

function resolveSection(envInline, envFile) {
  const inline = (process.env[envInline] || "").trim();
  if (inline) return inline;
  const filePath = process.env[envFile];
  if (filePath) return readFileSafe(filePath);
  return "";
}

export function loadPersonaFromEnv() {
  const identity = resolveSection("OPENCLAW_IDENTITY_MD", "OPENCLAW_IDENTITY_FILE");
  const soul = resolveSection("OPENCLAW_SOUL_MD", "OPENCLAW_SOUL_FILE");
  const memory = resolveSection("OPENCLAW_MEMORY_MD", "OPENCLAW_MEMORY_FILE");

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
