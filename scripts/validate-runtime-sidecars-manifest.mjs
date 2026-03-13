import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function typeName(value) {
  if (Array.isArray(value)) {
    return "array";
  }
  if (value === null) {
    return "null";
  }
  return typeof value;
}

function validateNode(value, schema, path, errors) {
  if (Object.prototype.hasOwnProperty.call(schema, "const") && value !== schema.const) {
    errors.push(`${path}: expected const value ${JSON.stringify(schema.const)}`);
    return;
  }

  if (schema.type) {
    if (schema.type === "object") {
      if (typeName(value) !== "object") {
        errors.push(`${path}: expected object, got ${typeName(value)}`);
        return;
      }
      const required = Array.isArray(schema.required) ? schema.required : [];
      for (const key of required) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) {
          errors.push(`${path}: missing required property '${key}'`);
        }
      }
      const properties = schema.properties ?? {};
      if (schema.additionalProperties === false) {
        for (const key of Object.keys(value)) {
          if (!Object.prototype.hasOwnProperty.call(properties, key)) {
            errors.push(`${path}: unexpected property '${key}'`);
          }
        }
      }
      for (const [key, subSchema] of Object.entries(properties)) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          validateNode(value[key], subSchema, `${path}.${key}`, errors);
        }
      }
      return;
    }

    if (schema.type === "array") {
      if (!Array.isArray(value)) {
        errors.push(`${path}: expected array, got ${typeName(value)}`);
        return;
      }
      if (typeof schema.minItems === "number" && value.length < schema.minItems) {
        errors.push(`${path}: expected at least ${schema.minItems} items, got ${value.length}`);
      }
      if (schema.items) {
        value.forEach((item, index) => {
          validateNode(item, schema.items, `${path}[${index}]`, errors);
        });
      }
      return;
    }

    if (schema.type === "string") {
      if (typeof value !== "string") {
        errors.push(`${path}: expected string, got ${typeName(value)}`);
        return;
      }
      if (schema.pattern) {
        const pattern = new RegExp(schema.pattern);
        if (!pattern.test(value)) {
          errors.push(`${path}: does not match pattern ${schema.pattern}`);
        }
      }
      if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
        errors.push(`${path}: expected one of ${schema.enum.join(", ")}`);
      }
      return;
    }

    if (schema.type === "integer") {
      if (!Number.isInteger(value)) {
        errors.push(`${path}: expected integer, got ${typeName(value)}`);
        return;
      }
      if (typeof schema.minimum === "number" && value < schema.minimum) {
        errors.push(`${path}: expected minimum ${schema.minimum}, got ${value}`);
      }
      return;
    }

    if (schema.type === "number") {
      if (typeof value !== "number" || Number.isNaN(value)) {
        errors.push(`${path}: expected number, got ${typeName(value)}`);
        return;
      }
      if (typeof schema.minimum === "number" && value < schema.minimum) {
        errors.push(`${path}: expected minimum ${schema.minimum}, got ${value}`);
      }
      return;
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifestArg = String(args.manifest ?? "").trim();
  const schemaArg = String(args.schema ?? "").trim();
  const manifestPath = manifestArg
    ? resolve(repoRoot, manifestArg)
    : join(repoRoot, "runtime-sidecars-manifest.json");
  const schemaPath = schemaArg
    ? resolve(repoRoot, schemaArg)
    : join(repoRoot, "docs", "runtime-sidecars", "manifest.schema.json");

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  const errors = [];
  validateNode(manifest, schema, "$", errors);

  if (errors.length > 0) {
    console.error(">>> [Node] Runtime sidecars manifest validation failed:");
    for (const message of errors) {
      console.error(`- ${message}`);
    }
    process.exit(1);
  }

  console.log(">>> [Node] Runtime sidecars manifest validation passed");
}

main();
