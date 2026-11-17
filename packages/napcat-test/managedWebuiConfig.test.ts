import { afterEach, expect, test, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseNapigConfig, setNapigConfig } from '../napcat-common/src/config';
import { WebUiConfigWrapper } from '../napcat-webui-backend/src/helper/config';

const paths = vi.hoisted(() => ({ configPath: '', logsPath: '' }));
vi.mock('@/napcat-webui-backend/index', () => ({ webUiPathWrapper: paths }));

afterEach(async () => { if (paths.configPath) await rm(paths.configPath, { recursive: true, force: true }); });

test('YAML owns services while writable theme preserves legacy settings for rollback', async () => {
  paths.configPath = await mkdtemp(join(tmpdir(), 'napig-config-'));
  const filename = join(paths.configPath, 'webui.json');
  await writeFile(filename, JSON.stringify({ host: 'legacy-host', port: 1234, autoLoginAccount: '987654321' }));
  setNapigConfig(parseNapigConfig('account: {id: "123456789"}\nwebui: {public-url: https://example.org}\n'));
  const wrapper = new WebUiConfigWrapper();
  const config = await wrapper.GetWebUIConfig();
  expect(config).toMatchObject({ host: '::', port: 6099 });
  expect(config).not.toHaveProperty('autoLoginAccount');
  await expect(wrapper.UpdateWebUIConfig({ port: 9876 })).rejects.toThrow('CONFIG_MANAGED');
  await wrapper.UpdateTheme(config.theme);
  const stored = JSON.parse(await readFile(filename, 'utf8'));
  expect(stored).toMatchObject({ host: 'legacy-host', port: 1234, autoLoginAccount: '987654321' });
  expect(stored.theme).toEqual(config.theme);
});
