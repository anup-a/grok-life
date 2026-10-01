#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { VERSION, loadCatalog } from "../src/catalog.mjs";
import { playbook, setupMessage } from "../src/playbook.mjs";

const DOWNLOAD_URL = "https://cursor.com/download/bot";

const HELP = `grok-life ${VERSION}: set up Grok Bot like a real, working life setup

  npx grok-life              copy the setup message and open Grok Bot
  npx grok-life list         the Bots it can set up
  npx grok-life message      print the setup message instead of copying it
  npx grok-life playbook     print the playbook Chief of Staff follows
  npx grok-life bridge       connect Claude Code / Codex on this computer (grok-bot-bridge)

Fill in answers ahead of time (optional; Chief of Staff asks otherwise):
  --name NAME  --tz Europe/London  --email you@gmail.com  --city "Shoreditch"`;

function parseArgs(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      pos.push(a);
      continue;
    }
    const [k, inline] = a.slice(2).split("=", 2);
    if (inline !== undefined) flags[k] = inline;
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) flags[k] = argv[++i];
    else flags[k] = true;
  }
  return { pos, flags };
}

function answers(flags) {
  const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  return { USER: str(flags.name), TZ: str(flags.tz), CITY: str(flags.city), EMAIL: str(flags.email) };
}

function openUrl(url) {
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  return spawnSync(cmd, args, { stdio: "ignore" }).status === 0;
}

function copy(text) {
  const tools =
    process.platform === "darwin"
      ? [["pbcopy", []]]
      : process.platform === "win32"
        ? [["clip", []]]
        : [["wl-copy", []], ["xclip", ["-selection", "clipboard"]], ["xsel", ["--clipboard", "--input"]]];
  for (const [cmd, args] of tools) {
    if (spawnSync(cmd, args, { input: text, stdio: ["pipe", "ignore", "ignore"] }).status === 0) return true;
  }
  return false;
}

function hasGrokBot() {
  if (process.platform !== "darwin") return null; // can't tell; assume the user knows
  return ["/Applications/Grok Bot.app", path.join(os.homedir(), "Applications", "Grok Bot.app")].some((p) => fs.existsSync(p));
}

function setup(flags) {
  if (hasGrokBot() === false) {
    console.log(`Grok Bot isn't installed. Opening the download page: ${DOWNLOAD_URL}\nInstall it, sign in, then run npx grok-life again.`);
    openUrl(DOWNLOAD_URL);
    return 1;
  }
  const message = setupMessage(loadCatalog(), answers(flags));
  const copied = copy(message);
  openUrl("grokbot://");
  if (!copied) console.log(`Copy everything between the lines:\n${"-".repeat(60)}\n${message}\n${"-".repeat(60)}\n`);
  console.log(`${copied ? "Copied the setup message.\n\n" : ""}In Grok Bot:
  1. Open your Chief of Staff. No Chief of Staff? Click +, then Create new Bot.
  2. Paste and send.

It asks a few questions (your name, timezone, which Bots you want),
then creates them: Inbox, Calendar, Health, Bills, Search, and any others you pick.
You connect Gmail, Calendar and the rest once; routines start paused until you say yes.
Nothing is sent, posted or paid without asking you first.`);
  return 0;
}

function list() {
  const catalog = loadCatalog();
  const groups = { life: "Life", work: "Work (optional)", builder: "Builders (optional)" };
  for (const [group, title] of Object.entries(groups)) {
    console.log(`${group === "life" ? "" : "\n"}${title}`);
    for (const b of catalog.bots.filter((x) => x.group === group)) {
      const name = b.name.includes("{{") ? "2nd Inbox" : b.name;
      const tags = [b.default ? "default" : null, b.routines.length ? `${b.routines.length} routine${b.routines.length > 1 ? "s" : ""}` : null].filter(Boolean);
      console.log(`  ${name.padEnd(16)} ${b.tagline}${tags.length ? `  [${tags.join(", ")}]` : ""}`);
    }
  }
  return 0;
}

function bridge() {
  const which = spawnSync(process.platform === "win32" ? "where" : "which", ["gbb"], { stdio: "ignore" });
  if (which.status !== 0) {
    console.log("Installing grok-bot-bridge (npm install -g grok-bot-bridge)...");
    const install = spawnSync("npm", ["install", "-g", "grok-bot-bridge"], { stdio: "inherit", shell: process.platform === "win32" });
    if (install.status !== 0) {
      console.error("Install failed. Run npm install -g grok-bot-bridge yourself, then gbb setup.");
      return 1;
    }
  }
  try {
    execFileSync("gbb", ["setup"], { stdio: "inherit" });
    return 0;
  } catch {
    return 1;
  }
}

function main() {
  const { pos, flags } = parseArgs(process.argv.slice(2));
  if (flags.version || flags.v) return console.log(VERSION), 0;
  if (flags.help || flags.h || pos[0] === "help") return console.log(HELP), 0;
  const cmd = pos[0] ?? "setup";
  switch (cmd) {
    case "setup":
      return setup(flags);
    case "list":
      return list();
    case "message":
      process.stdout.write(setupMessage(loadCatalog(), answers(flags)));
      return 0;
    case "playbook":
      process.stdout.write(playbook(loadCatalog(), answers(flags)));
      return 0;
    case "bridge":
      return bridge();
    default:
      console.error(`unknown command "${cmd}"\n\n${HELP}`);
      return 2;
  }
}

process.exitCode = main();
