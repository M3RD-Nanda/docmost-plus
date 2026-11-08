#!/usr/bin/env node
// Cegah perubahan tidak sengaja pada kode berlisensi Docmost Enterprise Edition.
// Dipakai di pre-commit hook dan CI. Exit 1 bila ada file ee/ yang berubah.
import { execSync } from "node:child_process";

const FORBIDDEN = ["apps/client/src/ee/", "packages/ee/"];

function changedFiles() {
  const base = process.argv[2] || "origin/main";
  try {
    return execSync(`git diff --name-only ${base}...HEAD`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    // fallback: staged + unstaged, untuk pre-commit
    return execSync("git diff --name-only HEAD", { encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
  }
}

const bad = changedFiles().filter((f) =>
  FORBIDDEN.some((p) => f.startsWith(p)),
);

if (bad.length) {
  console.error("❌ Perubahan pada kode berlisensi Enterprise Edition ditolak:");
  for (const f of bad) console.error("   " + f);
  console.error(
    "   Direktori itu hanya untuk konteks; implementasi kita ada di apps/*/src/plus/.",
  );
  process.exit(1);
}
console.log("guard-ee: bersih (0 file ee/ berubah)");
