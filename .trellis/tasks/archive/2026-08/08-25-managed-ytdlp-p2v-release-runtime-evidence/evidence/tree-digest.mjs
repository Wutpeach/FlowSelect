import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";

const root = resolve(process.argv[2] ?? "");
if (!root) throw new Error("usage: node tree-digest.mjs <root>");
const files = [];
const collect = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = resolve(directory, entry.name);
    if (entry.isDirectory()) await collect(child);
    else if (entry.isFile()) files.push(child);
  }
};
await collect(root);
files.sort();
const tree = createHash("sha256");
let bytes = 0;
for (const file of files) {
  const content = await readFile(file);
  const size = (await stat(file)).size;
  bytes += size;
  tree.update(`${relative(root, file).replaceAll("\\", "/")}|${size}|`);
  tree.update(createHash("sha256").update(content).digest("hex"));
  tree.update("\n");
}
console.log(JSON.stringify({ root, files: files.length, bytes, sha256: tree.digest("hex") }));
