import { describe, expect, test, vi } from 'vitest';
import { parseNapigConfig } from '../napcat-common/src/config';

const base = 'account:\n  id: "123456789"\nwebui:\n  public-url: https://napig.example.org\n';

describe('declarative configuration', () => {
  test('ignores nested unknown fields and warns with paths, never values', () => {
    const warn = vi.fn();
    const config = parseNapigConfig(base + 'version: 1\nconstructor: secret\nonebot:\n  network:\n    websocketClients:\n      - name: service\n        enable: true\n        url: ws://localhost:8080\n        passwrod: do-not-log-this\n', warn);
    expect(config.onebot.network.websocketClients[0]).toMatchObject({ name: 'service', enable: true });
    expect(config.onebot.network.websocketClients[0]).not.toHaveProperty('passwrod');
    expect(warn.mock.calls.flat().join('\n')).toContain('onebot.network.websocketClients[0].passwrod');
    expect(warn.mock.calls.flat().join('\n')).toContain('constructor');
    expect(warn.mock.calls.flat().join('\n')).not.toContain('do-not-log-this');
  });

  test('rejects invalid known values instead of coercing them', () => {
    expect(() => parseNapigConfig(base.replace('"123456789"', '123456789'))).toThrow('/account/id');
    expect(() => parseNapigConfig(base.replace('public-url: https://napig.example.org', 'port: "6099"'))).toThrow('/webui/port');
    expect(() => parseNapigConfig(base.replace('https://napig.example.org', 'https://napig.example.org/path'))).toThrow('HTTP(S) origin');
  });

  test('rejects duplicate YAML keys without exposing source values', () => {
    expect(() => parseNapigConfig(base + 'account: secret-value\n')).toThrow('DUPLICATE_KEY');
    try { parseNapigConfig(base + 'account: secret-value\n'); } catch (error) { expect(String(error)).not.toContain('secret-value'); }
  });
});
