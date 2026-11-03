/**
 * The editable part of the required-field rules: which issue types each field is
 * required for, and how severe a gap is. Conditions, impact and wording stay as defined
 * in requiredFields.ts. Stored per browser as a versioned, validated object.
 */
import { z } from "zod"
import { ISSUE_TYPES, type IssueType } from "../jira/types"
import { DEFAULT_REQUIRED_FIELDS, SEVERITIES, type FieldId, type RequiredField, type Severity } from "./requiredFields"

export const CONFIG_STORAGE_KEY = "jira-health:required-fields"

export type FieldConfig = { requiredFor: IssueType[]; severity: Severity }
export type RequiredFieldsConfig = { schemaVersion: 1; fields: Record<FieldId, FieldConfig> }

const FIELD_IDS = DEFAULT_REQUIRED_FIELDS.map((r) => r.field) as [FieldId, ...FieldId[]]

export const DEFAULT_CONFIG: RequiredFieldsConfig = {
  schemaVersion: 1,
  fields: Object.fromEntries(
    DEFAULT_REQUIRED_FIELDS.map((r) => [r.field, { requiredFor: [...r.requiredFor], severity: r.severity }]),
  ) as Record<FieldId, FieldConfig>,
}

/** Fields left out (e.g. added in a later version) fall back to their defaults. */
export const configSchema = z.object({
  schemaVersion: z.literal(1),
  fields: z.partialRecord(
    z.enum(FIELD_IDS),
    z.object({
      requiredFor: z.array(z.enum(ISSUE_TYPES)),
      severity: z.enum(SEVERITIES as [Severity, ...Severity[]]),
    }),
  ),
})

/** The rules with this config's types and severities. */
export function rulesFromConfig(config: RequiredFieldsConfig): RequiredField[] {
  return DEFAULT_REQUIRED_FIELDS.map((rule) => {
    const c = config.fields[rule.field]
    return c ? { ...rule, requiredFor: ISSUE_TYPES.filter((t) => c.requiredFor.includes(t)), severity: c.severity } : rule
  })
}

export function setRequired(config: RequiredFieldsConfig, field: FieldId, type: IssueType, required: boolean): RequiredFieldsConfig {
  const current = config.fields[field]
  const requiredFor = required ? [...new Set([...current.requiredFor, type])] : current.requiredFor.filter((t) => t !== type)
  return { ...config, fields: { ...config.fields, [field]: { ...current, requiredFor } } }
}

export function setSeverity(config: RequiredFieldsConfig, field: FieldId, severity: Severity): RequiredFieldsConfig {
  return { ...config, fields: { ...config.fields, [field]: { ...config.fields[field], severity } } }
}

const normalise = (c: RequiredFieldsConfig) =>
  JSON.stringify(FIELD_IDS.map((f) => [f, [...c.fields[f].requiredFor].sort(), c.fields[f].severity]))
export const isDefaultConfig = (c: RequiredFieldsConfig) => normalise(c) === normalise(DEFAULT_CONFIG)

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">

/** The saved config, or the defaults when there's none, it's invalid, or storage is unavailable. */
export function loadConfig(storage: StorageLike | null): RequiredFieldsConfig {
  try {
    const raw = storage?.getItem(CONFIG_STORAGE_KEY)
    if (!raw) return DEFAULT_CONFIG
    const parsed = configSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return DEFAULT_CONFIG
    return { schemaVersion: 1, fields: { ...DEFAULT_CONFIG.fields, ...parsed.data.fields } }
  } catch {
    return DEFAULT_CONFIG
  }
}

/** Save it (or forget it when it's the defaults). False when storage is unavailable. */
export function saveConfig(storage: StorageLike | null, config: RequiredFieldsConfig): boolean {
  if (!storage) return false
  try {
    if (isDefaultConfig(config)) storage.removeItem(CONFIG_STORAGE_KEY)
    else storage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config))
    return true
  } catch {
    return false
  }
}
