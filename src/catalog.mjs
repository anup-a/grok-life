import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export const VERSION = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;

export function loadCatalog() {
  return JSON.parse(fs.readFileSync(path.join(root, "catalog", "bots.json"), "utf8"));
}

/** Pick bots by id or name (case-insensitive). Empty selection means the defaults. */
export function selectBots(catalog, wanted = []) {
  if (wanted.length === 0) return catalog.bots.filter((b) => b.default);
  const keys = wanted.map((w) => w.trim().toLowerCase()).filter(Boolean);
  if (keys.includes("all")) return catalog.bots;
  const picked = [];
  for (const key of keys) {
    const bot = catalog.bots.find((b) => b.id === key || b.name.toLowerCase() === key);
    if (!bot) throw new Error(`unknown bot "${key}". Run grok-life list to see them.`);
    if (!picked.includes(bot)) picked.push(bot);
  }
  return picked;
}

/** Fill {{USER}}-style placeholders. Unknown values stay as placeholders for the Bot to fill in. */
export function fill(text, values = {}) {
  return text.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (values[k] ? values[k] : m));
}

/** Human-readable cron for the few shapes the catalog uses. */
export function describeCron(cron) {
  const [min, hour, dom, , dow] = cron.split(" ");
  const time = `${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
  const names = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
  const days = { "*": "every day", "1-5": "weekdays", "0-4": "Sunday to Thursday", ...Object.fromEntries(names.map((n, i) => [String(i), n])) };
  if (dom !== "*") return `day ${dom} of every month at ${time}`;
  return `${days[dow] ?? `cron days ${dow}`} at ${time}`;
}
