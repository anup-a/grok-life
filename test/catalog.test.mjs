import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { describeCron, fill, loadCatalog, selectBots } from "../src/catalog.mjs";
import { playbook, setupMessage } from "../src/playbook.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "bin", "grok-life.mjs");
const catalog = loadCatalog();

test("catalog bots are well formed", () => {
  const ids = new Set();
  for (const b of catalog.bots) {
    assert.ok(!ids.has(b.id), `duplicate id ${b.id}`);
    ids.add(b.id);
    assert.match(b.id, /^[a-z-]+$/);
    assert.ok(["life", "work", "builder"].includes(b.group), b.name);
    assert.ok(b.avatar.shape && b.avatar.color);
    assert.ok(b.tagline && b.tagline.length <= 80, `${b.name} tagline`);
    assert.ok(Array.isArray(b.hands_off_to) && Array.isArray(b.asks) && Array.isArray(b.connectors));
    assert.ok(b.brief.length > 40 && b.brief.length < 1200, `${b.name} brief length`);
    for (const r of b.routines) assert.equal(r.cron.split(" ").length, 5, `${b.name} cron`);
    const text = b.name + b.brief + b.routines.map((r) => r.name + r.content).join(" ");
    for (const [, p] of text.matchAll(/\{\{([A-Z_]+)\}\}/g)) assert.ok(p in catalog.placeholders, `${b.name} uses unknown {{${p}}}`);
  }
});

test("hand-offs point at Bots in the catalog", () => {
  const names = new Set(catalog.bots.map((b) => b.name));
  for (const b of catalog.bots) for (const h of b.hands_off_to) assert.ok(names.has(h), `${b.name} hands off to unknown ${h}`);
});

test("no personal data or em dashes in the catalog", () => {
  const text = JSON.stringify(catalog).toLowerCase();
  // Generic checks run everywhere; the private word list lives in the gitignored export/ folder.
  const privateList = path.join(root, "export", "private-words.txt");
  const extra = fs.existsSync(privateList) ? fs.readFileSync(privateList, "utf8").split("\n").map((w) => w.trim()).filter(Boolean) : [];
  const bad = ["anup", "aglawe", "—", ...extra];
  for (const word of bad) {
    const re = new RegExp(`(^|[^a-z])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`);
    assert.ok(!re.test(text), `catalog contains a private word (${word.length} chars)`);
  }
});

test("every Bot that can act carries the confirmation guardrail", () => {
  for (const b of catalog.bots) {
    if (["health", "search", "bridge"].includes(b.id)) continue;
    assert.match(b.brief, /without (explicit )?confirmation|never place trades/i, b.name);
  }
});

test("selectBots: defaults, names, all, unknown", () => {
  assert.deepEqual(selectBots(catalog).map((b) => b.id), ["inbox", "calendar", "health", "bills", "search"]);
  assert.deepEqual(selectBots(catalog, ["GitHub", "inbox"]).map((b) => b.id), ["github", "inbox"]);
  assert.equal(selectBots(catalog, ["all"]).length, catalog.bots.length);
  assert.throws(() => selectBots(catalog, ["nope"]), /unknown bot/);
});

test("fill keeps unknown placeholders", () => {
  assert.equal(fill("{{USER}} in {{TZ}}", { USER: "Sam" }), "Sam in {{TZ}}");
});

test("describeCron", () => {
  assert.equal(describeCron("30 8 * * 1-5"), "weekdays at 08:30");
  assert.equal(describeCron("30 8 1 * *"), "day 1 of every month at 08:30");
  assert.equal(describeCron("6 17 * * 5"), "Fridays at 17:06");
});

test("playbook covers every Bot, routine and key step", () => {
  const text = playbook(catalog);
  for (const b of catalog.bots) {
    assert.ok(text.includes(`### ${b.name}`), b.name);
    for (const r of b.routines) assert.ok(text.includes(`Routine "${r.name}"`), `${b.name}: ${r.name}`);
  }
  for (const s of ["Chief of Staff", "CreateAgent", "SendToAgent", "enabled=false", "npx grok-life bridge", "Create these?", "America/New_York"]) {
    assert.ok(text.includes(s), s);
  }
  assert.ok(!text.includes("—"), "no em dashes");
});

test("setup message fills answers", () => {
  const text = setupMessage(catalog, { USER: "Sam", TZ: "Europe/London", EMAIL: "sam@example.com" });
  assert.ok(text.startsWith("Hi! Please set up my Bots with grok-life."));
  assert.ok(text.includes("Triage Gmail for Sam (sam@example.com)"));
  assert.ok(text.includes("Timezone: Europe/London"));
});

test("cli: help, list, message", () => {
  const run = (...args) => execFileSync(process.execPath, [cli, ...args], { encoding: "utf8" });
  assert.match(run("--help"), /grok-life/);
  assert.match(run("list"), /Inbox\s+Personal Gmail/);
  assert.match(run("list"), /2nd Inbox/);
  assert.match(run("message", "--name", "Sam"), /Triage Gmail for Sam/);
});

// Local-only: compares against the private export of the original setup (export/ is gitignored).
const exportDir = path.join(root, "export", "raw");
test("covers every Bot and routine in the original setup", { skip: !fs.existsSync(exportDir) && "no private export" }, () => {
  const mapping = { "chief-of-staff": null, school: "second-inbox" };
  for (const file of fs.readdirSync(exportDir).filter((f) => f.endsWith(".md"))) {
    const raw = fs.readFileSync(path.join(exportDir, file), "utf8");
    const start = raw.indexOf('{"') >= 0 ? raw.indexOf('{"') : raw.indexOf("{\n");
    const real = JSON.parse(raw.slice(start, raw.lastIndexOf("}") + 1));
    const id = file.replace(/\.md$/, "");
    if (mapping[id] === null) continue; // Chief of Staff runs the playbook itself
    const bot = catalog.bots.find((b) => b.id === (mapping[id] ?? id));
    assert.ok(bot, `no catalog Bot for ${real.bot}`);
    const realRoutines = (real.routines ?? []).filter((r) => typeof r === "object" && !/webhook/i.test(r.trigger ?? ""));
    assert.equal(bot.routines.length, realRoutines.length, `${real.bot}: ${realRoutines.map((r) => r.name).join(", ")}`);
  }
});

test("fill handles underscore placeholders", () => {
  assert.equal(fill("{{SECOND_LABEL}} inbox", { SECOND_LABEL: "School" }), "School inbox");
});

test("Health explains how to connect each wearable", () => {
  const health = catalog.bots.find((b) => b.id === "health");
  const names = health.wearables.map((w) => w.name).join(" ");
  for (const device of ["Apple", "WHOOP", "Garmin", "Oura", "Ultrahuman"]) assert.ok(names.includes(device), device);
  const text = playbook(catalog);
  assert.ok(text.includes("- Wearables:") && text.includes("developer.whoop.com"));
});
