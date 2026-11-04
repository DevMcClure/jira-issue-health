import { describe, expect, it } from "vitest"
import sample from "@/data/mock/trawler-export.json?raw"
import { parseExportText } from "../jira/adapter"
import { checkDataset } from "./checks"
import {
  CONFIG_STORAGE_KEY,
  DEFAULT_CONFIG,
  isDefaultConfig,
  loadConfig,
  rulesFromConfig,
  saveConfig,
  setRequired,
  setSeverity,
} from "./config"
import { DEFAULT_FILTERS, applyFilters } from "./list"
import { DEFAULT_REQUIRED_FIELDS } from "./requiredFields"

function memoryStorage() {
  const map = new Map<string, string>()
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k), map }
}

describe("required-fields config", () => {
  it("defaults to the brief's rules", () => {
    expect(rulesFromConfig(DEFAULT_CONFIG)).toEqual(DEFAULT_REQUIRED_FIELDS)
    expect(isDefaultConfig(DEFAULT_CONFIG)).toBe(true)
  })

  it("unticking Story points for flow-defect takes those tickets off the list", () => {
    const dataset = parseExportText(sample)
    const unticked = setRequired(DEFAULT_CONFIG, "storyPoints", "flow-defect", false)
    const defectsMissingPoints = (rules = DEFAULT_REQUIRED_FIELDS) =>
      applyFilters(checkDataset(dataset, rules), { ...DEFAULT_FILTERS, sprint: "all", types: ["flow-defect"], fields: ["storyPoints"] }, dataset).rows.length
    expect(defectsMissingPoints()).toBeGreaterThan(0)
    expect(defectsMissingPoints(rulesFromConfig(unticked))).toBe(0)
    expect(isDefaultConfig(unticked)).toBe(false)
    expect(isDefaultConfig(setRequired(unticked, "storyPoints", "flow-defect", true))).toBe(true)
  })

  it("changes a field's severity", () => {
    const rules = rulesFromConfig(setSeverity(DEFAULT_CONFIG, "priority", "critical"))
    expect(rules.find((r) => r.field === "priority")?.severity).toBe("critical")
  })

  it("keeps the rules' type order whatever order types were ticked in", () => {
    const config = setRequired(setRequired(DEFAULT_CONFIG, "epicKey", "Spike", true), "epicKey", "flow-value", false)
    expect(rulesFromConfig(config).find((r) => r.field === "epicKey")?.requiredFor).toEqual([
      "flow-quality",
      "flow-defect",
      "flow-accelerator",
      "Spike",
    ])
  })

  it("survives a refresh, and forgets itself when back to the defaults", () => {
    const storage = memoryStorage()
    const changed = setRequired(DEFAULT_CONFIG, "storyPoints", "flow-defect", false)
    expect(saveConfig(storage, changed)).toBe(true)
    expect(loadConfig(storage)).toEqual(changed)
    saveConfig(storage, DEFAULT_CONFIG)
    expect(storage.map.has(CONFIG_STORAGE_KEY)).toBe(false)
  })

  it("falls back to the defaults for a config saved with old issue types", () => {
    const storage = memoryStorage()
    storage.setItem(CONFIG_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, fields: { storyPoints: { requiredFor: ["Story", "Bug"], severity: "critical" } } }))
    expect(loadConfig(storage)).toEqual(DEFAULT_CONFIG)
  })

  it("falls back to the defaults for invalid or unreadable storage", () => {
    const storage = memoryStorage()
    storage.setItem(CONFIG_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, fields: { storyPoints: { requiredFor: ["Feature"], severity: "critical" } } }))
    expect(loadConfig(storage)).toEqual(DEFAULT_CONFIG)
    storage.setItem(CONFIG_STORAGE_KEY, "{")
    expect(loadConfig(storage)).toEqual(DEFAULT_CONFIG)
    const throwing = { getItem: () => { throw new Error("x") }, setItem: () => { throw new Error("x") }, removeItem: () => {} }
    expect(loadConfig(throwing)).toEqual(DEFAULT_CONFIG)
    expect(saveConfig(throwing, DEFAULT_CONFIG)).toBe(true)
    expect(saveConfig(throwing, setSeverity(DEFAULT_CONFIG, "labels", "warning"))).toBe(false)
    expect(saveConfig(null, DEFAULT_CONFIG)).toBe(false)
  })

  it("fills fields a saved config doesn't mention from the defaults", () => {
    const storage = memoryStorage()
    storage.setItem(CONFIG_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, fields: { labels: { requiredFor: ["flow-quality"], severity: "warning" } } }))
    const config = loadConfig(storage)
    expect(config.fields.labels).toEqual({ requiredFor: ["flow-quality"], severity: "warning" })
    expect(config.fields.storyPoints).toEqual(DEFAULT_CONFIG.fields.storyPoints)
  })
})
