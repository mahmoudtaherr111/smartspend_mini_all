#!/usr/bin/env node
/**
 * Makes the built folder something a person can open: the little server, and one launcher per platform.
 *
 * Without this the artifact is a folder of HTML whose stylesheet never loads, because the pages reference
 * their assets by absolute path. With it, the reader unzips and double-clicks.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(SITE, "dist");

fs.copyFileSync(path.join(SITE, "serve.mjs"), path.join(DIST, "serve.mjs"));

fs.writeFileSync(
  path.join(DIST, "افتح-الشرح.cmd"),
  ["@echo off", "start \"\" http://localhost:4321", "node \"%~dp0serve.mjs\"", ""].join("\r\n"),
  "utf8",
);

fs.writeFileSync(
  path.join(DIST, "open-docs.sh"),
  ["#!/bin/sh", 'cd "$(dirname "$0")" || exit 1', "node serve.mjs", ""].join("\n"),
  { encoding: "utf8", mode: 0o755 },
);

fs.writeFileSync(
  path.join(DIST, "README.txt"),
  [
    "شرح SmartSpend — نسخة تتصفح على جهازك",
    "",
    "على ويندوز: دوس دوبل على «افتح-الشرح.cmd».",
    "على ماك أو لينكس: شغّل ./open-docs.sh من الطرفية.",
    "أو من أي مكان: node serve.mjs ثم افتح http://localhost:4321",
    "",
    "محتاج Node مثبّت (نفس اللي بيشغّل المشروع). مش محتاج نت.",
    "",
    "الصفحات دي متولّدة من مجلد docs/ في المشروع، فهي نفس الكلام اللي الـagents بتقراه.",
  ].join("\r\n"),
  "utf8",
);

console.log("packaged: serve.mjs, launchers and README.txt are in dist/");
