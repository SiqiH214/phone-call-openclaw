import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function readFileSafe(filePath) {
  if (!filePath) return "";
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

function readLatestMemory(memoryDir) {
  if (!memoryDir) return "";
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

function resolveSection(envInline, envFile, repoFallback) {
  const inline = (process.env[envInline] || "").trim();
  if (inline) return inline;
  const filePath = process.env[envFile];
  if (filePath) {
    const fromFile = readFileSafe(filePath);
    if (fromFile) return fromFile;
  }
  return readFileSafe(path.join(repoRoot, repoFallback));
}

function resolveMemory() {
  const inline = (process.env.OPENCLAW_MEMORY_MD || "").trim();
  if (inline) return inline;
  const filePath = process.env.OPENCLAW_MEMORY_FILE;
  if (filePath) {
    const fromFile = readFileSafe(filePath);
    if (fromFile) return fromFile;
  }
  const memoryDir = process.env.OPENCLAW_MEMORY_DIR;
  if (memoryDir) {
    const fromDir = readLatestMemory(memoryDir);
    if (fromDir) return fromDir;
  }
  return readFileSafe(path.join(repoRoot, "persona", "MEMORY.md"));
}

export function loadPersona() {
  const identity = resolveSection("OPENCLAW_IDENTITY_MD", "OPENCLAW_IDENTITY_FILE", "persona/IDENTITY.md");
  const soul = resolveSection("OPENCLAW_SOUL_MD", "OPENCLAW_SOUL_FILE", "persona/SOUL.md");
  const memory = resolveMemory();

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
  const persona = loadPersona();
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
