import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { startQQBotManagement } from '@/napcat-shell/qqbot-management';

const sdk = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => unknown>(), start: vi.fn(), stop: vi.fn(), sendText: vi.fn() }));
vi.mock('../napcat-shell/node_modules/@tencent-connect/qqbot-nodejs/dist/index.js', () => ({
  QQBot: class {
    on (event: string, handler: (...args: any[]) => unknown) { sdk.handlers.set(event, handler); }
    start = sdk.start;
    stop = sdk.stop;
    sendText = sdk.sendText;
  },
}));
let manager: ReturnType<typeof startQQBotManagement>;
const login = vi.fn(async () => ({ result: true, message: 'accepted' }));
function setup (publicUrl?: string) {
  manager = startQQBotManagement({
    config: { 'app-id': 'app', 'app-secret': 'secret', admins: ['admin'] },
    publicUrl,
    getStatus: () => ({ worker: 'cooldown', account: { account: '12345', phase: 'offline', reason: 'Worker failed' } }),
    login,
    log: vi.fn(),
  });
}
async function message (id: string, senderId: string, content: string) {
  await sdk.handlers.get('message')!({}, { messageId: id, senderId, content, replyTarget: { scope: 'c2c', targetId: senderId, msgId: id } });
}
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); sdk.handlers.clear(); sdk.start.mockImplementation(() => new Promise(() => {})); sdk.sendText.mockResolvedValue({}); });
afterEach(() => { manager?.stop(); vi.useRealTimers(); });

it('authenticates commands, exposes only whoami publicly, and ignores duplicate commands', async () => {
  setup('https://example.test');
  await sdk.handlers.get('ready')!();
  await message('1', 'stranger', '/login');
  expect(login).not.toHaveBeenCalled();
  await message('2', 'stranger', '/whoami');
  expect(sdk.sendText).toHaveBeenCalledWith(expect.objectContaining({ targetId: 'stranger' }), '你的 user_openid：stranger');
  await message('3', 'admin', '/login qr');
  await message('3', 'admin', '/login qr');
  expect(login).toHaveBeenCalledTimes(1);
  expect(login).toHaveBeenCalledWith('qr');
  expect(sdk.sendText.mock.calls.at(-1)![1]).toContain('https://example.test/webui/qq_login');
});

it('restarts a failed token fetch once without competing with live gateway reconnects', async () => {
  sdk.start.mockRejectedValueOnce(new Error('Network error getting access_token: timeout'));
  setup();
  await vi.advanceTimersByTimeAsync(0);
  expect(manager.getConnectionStatus()).toBe('failed');
  await vi.advanceTimersByTimeAsync(60_000);
  expect(sdk.start).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(600_000);
  expect(sdk.start).toHaveBeenCalledTimes(2);
});

it('cancels pending retry on stop', async () => {
  sdk.start.mockRejectedValue(new Error('Failed to get access_token: invalid credentials'));
  setup();
  await vi.advanceTimersByTimeAsync(0);
  expect(sdk.start).toHaveBeenCalledTimes(1);
  manager.stop();
  await vi.advanceTimersByTimeAsync(600_000);
  expect(sdk.start).toHaveBeenCalledTimes(1);
});

it('leaves fatal banned/offline applications for operator action', async () => {
  sdk.start.mockRejectedValue(Object.assign(new Error('banned'), { code: 'GATEWAY_FATAL_CLOSE' }));
  setup();
  await vi.advanceTimersByTimeAsync(1_800_000);
  expect(sdk.start).toHaveBeenCalledTimes(1);
});
