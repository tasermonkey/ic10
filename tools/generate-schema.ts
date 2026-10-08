import { writeFile } from "node:fs/promises";
import path from "node:path";
import { toJsonSchema } from "@valibot/to-json-schema";
import { EnvSchema } from "../src/Schemas/EnvSchema.ts";

const target = path.join(import.meta.dirname, "..", "src", "Schemas", "env.schema.json");
const schema = JSON.stringify(toJsonSchema(EnvSchema), null, 2);
await writeFile(target, schema);
