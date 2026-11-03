/**
 * Writes the deterministic mock export to src/data/mock/trawler-export.json.
 *
 *   pnpm mock
 */
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { generateMockExport } from "../src/data/mock/generator.ts"

const out = resolve(import.meta.dirname, "../src/data/mock/trawler-export.json")
const data = generateMockExport()
writeFileSync(out, `${JSON.stringify(data, null, 2)}\n`)
console.log(`Wrote ${data.issues.length} issues to ${out}`)
