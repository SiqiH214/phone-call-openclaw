import fs from "node:fs";
import path from "node:path";

const localPersonaPaths = {
  identity: "/root/.openclaw/workspace/IDENTITY.md",
  soul: "/root/.openclaw/workspace/SOUL.md",
  style: "/root/.openclaw/workspace/STYLE.md",
  memory: "/root/.openclaw/workspace/memory",
};

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

function readLatestMemory(memoryDir) {
  try {
    const files = fs
      .readdirSync(memoryDir)
      .filter((file) => file.toLowerCase().endsWith(".md"))
      .sort();
    const latest = files.at(-1);
    return latest ? readFileSafe(path.join(memoryDir, latest)) : "";
  } catch {
    return "";
  }
}

export function loadPersona() {
  const identity = process.env.OPENCLAW_IDENTITY_MD || readFileSafe(localPersonaPaths.identity);
  const soul = process.env.OPENCLAW_SOUL_MD || readFileSafe(localPersonaPaths.soul);
  const style = process.env.OPENCLAW_STYLE_MD || readFileSafe(localPersonaPaths.style);
  const memory = process.env.OPENCLAW_MEMORY_MD || readLatestMemory(localPersonaPaths.memory);

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

export function personaInstructionBlock() {
  const persona = loadPersona();
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
