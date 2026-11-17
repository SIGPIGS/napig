import fs from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';
import { Type, type Static, type TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { OneBotConfigSchema } from './onebot-config';

const WebuiSchema = Type.Object({
  enabled: Type.Boolean({ default: true }),
  host: Type.String({ minLength: 1, default: '::' }),
  port: Type.Integer({ minimum: 1, maximum: 65535, default: 6099 }),
  'public-url': Type.Optional(Type.String()),
  accessControlMode: Type.Union([Type.Literal('none'), Type.Literal('whitelist'), Type.Literal('blacklist')], { default: 'none' }),
  ipWhitelist: Type.Array(Type.String(), { default: [] }),
  ipBlacklist: Type.Array(Type.String(), { default: [] }),
  enableXForwardedFor: Type.Boolean({ default: false }),
}, { default: {} });

const ConfigSchema = Type.Object({
  webui: WebuiSchema,
  account: Type.Object({
    id: Type.String({ pattern: '^[1-9][0-9]+$' }),
    password: Type.Optional(Type.String({ minLength: 1 })),
  }),
  onebot: Type.Object(OneBotConfigSchema.properties, { default: {} }),
  qqbot: Type.Optional(Type.Object({
    'app-id': Type.String({ pattern: '^[0-9]+$' }),
    'app-secret': Type.String({ minLength: 1 }),
    admins: Type.Array(Type.String({ minLength: 1 }), { default: [] }),
  })),
});

export type NapigConfig = Static<typeof ConfigSchema>;

// Filter before applying defaults so misspelled fields remain visible to operators.
function knownFields (schema: TSchema, value: unknown, field: string, warn: (message: string) => void): unknown {
  if (schema['type'] === 'object' && value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      const childPath = field ? `${field}.${key}` : key;
      const property = Object.prototype.hasOwnProperty.call(schema['properties'], key) ? schema['properties'][key] as TSchema : undefined;
      if (property) result[key] = knownFields(property, child, childPath, warn);
      else warn(`Unknown config field: ${childPath}; ignored`);
    }
    return result;
  }
  if (schema['type'] === 'array' && Array.isArray(value)) {
    return value.map((item, index) => knownFields(schema['items'], item, `${field}[${index}]`, warn));
  }
  return value;
}

export function parseNapigConfig (text: string, warn: (message: string) => void = console.warn): NapigConfig {
  const document = parseDocument(text, { prettyErrors: false });
  if (document.errors.length) {
    // Parser messages may quote source lines containing credentials.
    throw new Error(`Invalid napig YAML (${document.errors[0]!.code})`);
  }
  const data = Value.Default(ConfigSchema, knownFields(ConfigSchema, document.toJS(), '', warn));
  const errors = [...Value.Errors(ConfigSchema, data)];
  if (errors.length) throw new Error(`Invalid napig config: ${errors.map(error => `${error.path}: ${error.message}`).join('; ')}`);
  const config = data as NapigConfig;
  const publicUrl = config.webui['public-url'];
  if (config.webui.enabled && !publicUrl) throw new Error('webui.public-url is required when WebUI is enabled');
  if (publicUrl) {
    let url: URL;
    try { url = new URL(publicUrl); } catch { throw new Error('webui.public-url must be an HTTP(S) origin'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('webui.public-url must be an HTTP(S) origin without path, credentials, query or fragment');
    }
    config.webui['public-url'] = url.origin;
  }
  return config;
}

let config: NapigConfig | undefined;

export function setNapigConfig (value: NapigConfig): void {
  config = value;
}

export function getNapigConfig (): NapigConfig {
  if (!config) {
    const filename = path.resolve(process.env['NAPIG_CONFIG'] || 'napig.yaml');
    config = parseNapigConfig(fs.readFileSync(filename, 'utf8'));
    for (const name of ['ACCOUNT', 'NAPCAT_QUICK_ACCOUNT', 'NAPCAT_QUICK_PASSWORD', 'NAPCAT_QUICK_PASSWORD_MD5', 'NAPCAT_WEBUI_PUBLIC_URL', 'NAPCAT_WEBUI_PREFERRED_PORT']) {
      if (process.env[name] !== undefined) console.warn(`Ignored legacy environment variable: ${name}; use napig.yaml`);
    }
  }
  return config;
}
