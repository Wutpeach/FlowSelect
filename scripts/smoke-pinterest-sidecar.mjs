import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const sidecarDir = join(repoRoot, "desktop-assets", "pinterest-sidecar");

function parseArgs(argv) {
  const parsed = {};
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  if (!parsed.mode && positional[0] && (positional[0] === "source" || positional[0] === "binary")) {
    parsed.mode = positional[0];
  }
  if (!parsed.target) {
    const positionalTarget =
      parsed.mode && positional[0] === parsed.mode ? positional[1] : positional[0];
    if (positionalTarget) {
      parsed.target = positionalTarget;
    }
  }
  return parsed;
}

function localTargetTriple() {
  if (process.platform === "win32" && process.arch === "x64") {
    return "x86_64-pc-windows-msvc";
  }
  if (process.platform === "darwin" && process.arch === "arm64") {
    return "aarch64-apple-darwin";
  }
  if (process.platform === "darwin" && process.arch === "x64") {
    return "x86_64-apple-darwin";
  }
  throw new Error(`Unsupported local sidecar smoke platform: ${process.platform}-${process.arch}`);
}

function localPython() {
  if (process.platform === "win32") {
    return "python";
  }
  return "python3";
}

function binaryPath(target) {
  const ext = target.endsWith("-windows-msvc") ? ".exe" : "";
  return join(repoRoot, "desktop-assets", "binaries", `pinterest-dl-${target}${ext}`);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ALL_PROXY: "",
      all_proxy: "",
      HTTP_PROXY: "",
      http_proxy: "",
      HTTPS_PROXY: "",
      https_proxy: "",
      NO_PROXY: "",
      no_proxy: "",
    },
  });

  if (result.status !== 0) {
    throw new Error(
      `Smoke command failed with code ${result.status}: ${command} ${args.join(" ")}\n${result.stderr}`,
    );
  }

  return result.stdout;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.mode || "source";
  const target = args.target || localTargetTriple();
  const scratchDir = mkdtempSync(join(tmpdir(), "flowselect-pin-sidecar-smoke-"));
  const outputDir = join(scratchDir, "out");
  const payloadPath = join(scratchDir, "payload.json");

  try {
    writeFileSync(
      payloadPath,
      JSON.stringify(
        {
          traceId: "smoke-trace",
          pageUrl: "https://www.pinterest.com/pin/1234567890/",
          pinId: 1234567890,
          title: "Smoke Test",
          origin: "https://www.pinterest.com/pin/1234567890/",
          cookiesHeader: "session=smoke",
          image: {
            url: "https://i.pinimg.com/originals/example.jpg",
            width: 720,
            height: 1280,
          },
          video: {
            url: "https://v1.pinimg.com/videos/example.mp4",
            width: 720,
            height: 1280,
            durationSeconds: 12,
          },
          outputDir,
        },
        null,
        2,
      ),
      "utf8",
    );

    const stdout =
      mode === "binary"
        ? run(binaryPath(target), ["--input-json", payloadPath, "--self-test"])
        : run(localPython(), [join(sidecarDir, "__main__.py"), "--input-json", payloadPath, "--self-test"]);

    if (!stdout.includes("FLOWSELECT_PINTEREST_RESULT\t")) {
      throw new Error(`Smoke output missing result line:\n${stdout}`);
    }

    const resultLine = stdout
      .split(/\r?\n/)
      .find((line) => line.startsWith("FLOWSELECT_PINTEREST_RESULT\t"));
    if (!resultLine) {
      throw new Error(`Smoke output missing parsable result line:\n${stdout}`);
    }

    const resultPath = resultLine.split("\t")[1];
    if (!resultPath || !existsSync(resultPath)) {
      throw new Error(`Smoke result file does not exist: ${resultPath || "<missing>"}`);
    }

    const resultBody = readFileSync(resultPath, "utf8");
    console.log(
      JSON.stringify(
        {
          mode,
          target,
          resultPath,
          resultSize: resultBody.length,
        },
        null,
        2,
      ),
    );
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
}

main();
