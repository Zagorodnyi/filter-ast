import { execFileSync } from "node:child_process";
import { cpus } from "node:os";
import { fileURLToPath } from "node:url";
import { buildAbstractFilterTree, $and, $or } from "../dist/index.mjs";

const ROUNDS = 11;
const ITERATIONS = 100_000;
const WARMUP = 20_000;
const POOL = 4096;

const list200 = Array.from({ length: 200 }, (_, i) => i + 1).join(",");

const WORKLOADS = [
  ["flat, 3 fields", () => ({ status: "active", age: "$gte(18)", country: "UA" })],
  ["operators, 5 fields", () => ({ a: "$in(1,2,3,4,5)", b: "$between(1,4)", c: "$like(%john%)", d: "$ne(x)", e: "$gt(10)" })],
  ["nested $and/$or, 3 levels", () => ({ a: "1", [$and]: { b: "$between(1,4)", [$or]: { c: "$in(1,2,3,4,5)", [$and]: { d: 12 } } } })],
  ["$in, 200 items", () => ({ id: `$in(${list200})` })],
];

let sink = 0;

function cell(index, mode) {
  const make = WORKLOADS[index][1];
  const filters = mode === "hot" ? [make()] : Array.from({ length: POOL }, make);
  const mask = filters.length - 1;
  for (let i = 0; i < WARMUP; i++) {
    sink += buildAbstractFilterTree(filters[i & mask]).length;
  }
  const samples = [];
  for (let r = 0; r < ROUNDS; r++) {
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      sink += buildAbstractFilterTree(filters[i & mask]).length;
    }
    samples.push(((performance.now() - start) * 1e6) / ITERATIONS);
  }
  samples.sort((a, b) => a - b);
  return samples[ROUNDS >> 1];
}

function run(index, mode) {
  const out = execFileSync(process.execPath, [fileURLToPath(import.meta.url), String(index), mode], { encoding: "utf8" });
  return JSON.parse(out).ns;
}

function format(ns) {
  const perSecond = 1e9 / ns;
  const rate = perSecond >= 1e6 ? `${(perSecond / 1e6).toFixed(1)} M ops/s` : `${(perSecond / 1e3).toFixed(0)} K ops/s`;
  return `${ns >= 100 ? ns.toFixed(0) : ns.toFixed(1)} ns (${rate})`;
}

const [index, mode] = process.argv.slice(2);
if (index !== undefined) {
  console.log(JSON.stringify({ ns: cell(Number(index), mode), sink }));
} else {
  const runtime = typeof Bun === "undefined" ? `Node ${process.version}` : `Bun ${Bun.version}`;
  console.log(`${runtime} · ${cpus()[0].model}\n`);
  console.log("| Workload | Hot | Fresh |");
  console.log("|---|---|---|");
  for (let i = 0; i < WORKLOADS.length; i++) {
    console.log(`| ${WORKLOADS[i][0]} | ${format(run(i, "hot"))} | ${format(run(i, "fresh"))} |`);
  }
}
