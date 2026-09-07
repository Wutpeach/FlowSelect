import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { ProxyAgent, setGlobalDispatcher } from "undici";

const revision = "3ad2542ea4487e95884f313b84943df602c0e742";
const registryVersion = "1.0.0-rc.6";
const taskDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(taskDir, "../../..");
const outputPath = resolve(taskDir, "evidence/provenance-mechanism-equivalence.json");
const sourceRoot = `https://raw.githubusercontent.com/oneworks-ai/avatar/${revision}`;
const execFileAsync = promisify(execFile);

const proxy = process.env.HTTPS_PROXY ?? process.env.ALL_PROXY;
if (proxy) {
  setGlobalDispatcher(new ProxyAgent(proxy));
}

const sourcePaths = {
  catPreset: "src/avatarEntityPresets.ts",
  geometry: "src/avatarGeometry.ts",
  interactiveAvatar: "src/InteractiveAvatar.tsx",
  reactEntry: "packages/react/src/index.tsx",
};

const readPinnedSource = async (path) => {
  const url = `${sourceRoot}/${path}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    return await response.text();
  } catch (fetchError) {
    try {
      const { stdout } = await execFileAsync(
        process.platform === "win32" ? "curl.exe" : "curl",
        ["--fail", "--retry", "3", "--retry-delay", "1", "--connect-timeout", "20", "-L", url],
        { encoding: "utf8", maxBuffer: 5 * 1024 * 1024 },
      );
      return stdout;
    } catch (curlError) {
      throw new Error(`Could not read pinned ${path}: fetch=${String(fetchError)} curl=${String(curlError)}`);
    }
  }
};

const requireText = (source, text, label) => {
  if (!source.includes(text)) {
    throw new Error(`Missing ${label}: ${text}`);
  }
};

const sha256 = (source) => createHash("sha256").update(source).digest("hex");

const catParts = [
  [
    "left ear",
    [
      "cat-ear-left",
      "occludedByFace",
      "rotationX: -7",
      "rotationY: -13",
      "rotationZ: -9",
      "roundness: 48",
      "scaleX: .24",
      "scaleY: .29",
      "shape: 'cone'",
      "x: -56",
      "y: -78",
      "z: -8",
    ],
    [
      "cat-ear-left",
      "occludedByFace: !0",
      "rotationX: -7",
      "rotationY: -13",
      "rotationZ: -9",
      "roundness: 48",
      "scaleX: 0.24",
      "scaleY: 0.29",
      'shape: "cone"',
      "x: -56",
      "y: -78",
      "z: -8",
    ],
  ],
  [
    "right ear",
    [
      "cat-ear-right",
      "occludedByFace",
      "rotationX: -6",
      "rotationY: 13",
      "rotationZ: 9",
      "roundness: 52",
      "scaleX: .23",
      "scaleY: .28",
      "shape: 'cone'",
      "x: 56",
      "y: -78",
      "z: -10",
    ],
    [
      "cat-ear-right",
      "occludedByFace: !0",
      "rotationX: -6",
      "rotationY: 13",
      "rotationZ: 9",
      "roundness: 52",
      "scaleX: 0.23",
      "scaleY: 0.28",
      'shape: "cone"',
      "x: 56",
      "y: -78",
      "z: -10",
    ],
  ],
  [
    "head",
    ["cat-head", "face: true", "scaleX: .73", "scaleY: .68", "shape: 'ellipse'", "x: 0", "y: 12", "z: 0"],
    ["cat-head", "face: !0", "scaleX: 0.73", "scaleY: 0.68", 'shape: "ellipse"', "x: 0", "y: 12", "z: 0"],
  ],
];

const main = async () => {
  const [catPreset, geometry, interactiveAvatar, reactEntry, bundle, declarations, reactPackage, corePackage] = await Promise.all([
    readPinnedSource(sourcePaths.catPreset),
    readPinnedSource(sourcePaths.geometry),
    readPinnedSource(sourcePaths.interactiveAvatar),
    readPinnedSource(sourcePaths.reactEntry),
    readFile(resolve(repoRoot, "node_modules/@oneworks/avatar-react/dist/index.js"), "utf8"),
    readFile(resolve(repoRoot, "node_modules/@oneworks/avatar-react/dist/index.d.ts"), "utf8"),
    readFile(resolve(repoRoot, "node_modules/@oneworks/avatar-react/package.json"), "utf8"),
    readFile(resolve(repoRoot, "node_modules/@oneworks/avatar/package.json"), "utf8"),
  ]);
  const sourceCat = catPreset.slice(catPreset.indexOf("const CAT_PARTS"), catPreset.indexOf("const DOG_PARTS"));
  const bundleCat = bundle.slice(bundle.indexOf("cat-ear-left") - 100, bundle.indexOf("], Hs = ["));

  for (const [label, sourceFacts, bundleFacts] of catParts) {
    for (const fact of sourceFacts) requireText(sourceCat, fact, `pinned cat ${label}`);
    for (const fact of bundleFacts) requireText(bundleCat, fact, `registry cat ${label}`);
  }

  for (const [source, fact, label] of [
    [geometry, "cone: { exponent: 1", "pinned cone profile"],
    [geometry, "progress ** interpolate(1, .56, roundness)", "pinned rounded cone profile"],
    [geometry, "roundedVertexPolygonPath(hull, apex, 8 + roundness * 64)", "pinned rounded cone outline"],
    [interactiveAvatar, "const projectedParts = parts.map", "pinned shared pose projection"],
    [interactiveAvatar, ".sort((left, right) => left.depth - right.depth)", "pinned shared depth sort"],
    [interactiveAvatar, "part.occludedByFace === true", "pinned face occlusion flag"],
    [interactiveAvatar, "part.depth <= facePart.depth + ENTITY_OCCLUSION_DEPTH_TOLERANCE", "pinned face depth tolerance"],
    [interactiveAvatar, "<mask", "pinned face mask"],
    [reactEntry, "export const Avatar =", "pinned Avatar export"],
    [reactEntry, "export const AvatarEditor =", "pinned AvatarEditor export"],
    [bundle, 'cone: { exponent: 1, faceCurvature: 0.8, faceScale: 0.8, profile: "cone"', "registry cone profile"],
    [bundle, 't.profile !== "superellipsoid" && !s', "registry procedural cone path"],
    [bundle, "d ** se(1, 0.56, u)", "registry rounded cone profile"],
    [bundle, "gs(z, $, 8 + K * 64)", "registry rounded cone outline"],
    [bundle, ").sort((b, F) => b.depth - F.depth)", "registry shared depth sort"],
    [bundle, "b.occludedByFace === !0", "registry face occlusion flag"],
    [bundle, "b.depth <= H.depth + Us", "registry face depth tolerance"],
    [bundle, '"mask"', "registry face mask"],
    [declarations, "export declare const Avatar:", "registry Avatar export"],
    [declarations, "export declare const AvatarEditor:", "registry AvatarEditor export"],
  ]) {
    requireText(source, fact, label);
  }

  const reactMetadata = JSON.parse(reactPackage);
  const coreMetadata = JSON.parse(corePackage);
  if (reactMetadata.version !== registryVersion || coreMetadata.version !== registryVersion) {
    throw new Error("Installed OneWorks packages are not the required rc.6 versions.");
  }

  const result = {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    pinnedRevision: revision,
    registryVersion,
    installedPackageVersions: {
      "@oneworks/avatar": coreMetadata.version,
      "@oneworks/avatar-react": reactMetadata.version,
    },
    mechanismEquivalent: true,
    verifiedMechanisms: [
      "exact three-part cat values",
      "procedural cone and roundness path",
      "shared pose/depth sort",
      "face occlusion mask and depth tolerance",
      "public Avatar and AvatarEditor exports",
    ],
    byteIdentity: "not-checked",
    buildArtifactProvenance: "not-proven",
    limitation: "This verifies the mechanisms used by the Lab spike, not byte identity or a source-built registry artifact.",
    sourceSha256: {
      catPreset: sha256(catPreset),
      geometry: sha256(geometry),
      interactiveAvatar: sha256(interactiveAvatar),
      reactEntry: sha256(reactEntry),
    },
    installedArtifactSha256: {
      avatarReactBundle: sha256(bundle),
      avatarReactDeclarations: sha256(declarations),
    },
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result)}\n`);
};

await main();
