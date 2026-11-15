import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { auth } from '../napcat-webui-backend/src/middleware/auth';
import { configureExternalAuth, externalAuthError } from '../napcat-webui-backend/src/helper/ExternalAuth';

const origin = 'https://napig.example.com';
const userHeader = { 'X-Auth-Request-User': 'operator' };

describe('external WebUI authentication', () => {
  const app = express();
  app.use(auth);
  app.all('/api/example', (_, res) => res.json({ allowed: true }));
  const server = createServer(app);
  let base: string;

  beforeAll(async () => {
    configureExternalAuth(origin);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });

  test.each([
    { label: 'missing proxy identity', method: 'GET', headers: {}, status: 401 },
    { label: 'old bearer credentials do not authenticate', method: 'GET', headers: { Authorization: 'Bearer old-token' }, status: 401 },
    { label: 'same-origin page or SSE', method: 'GET', headers: userHeader, status: 200 },
    { label: 'explicit foreign-origin read', method: 'GET', headers: { ...userHeader, Origin: 'https://other.example.com' }, status: 403 },
    { label: 'same-origin write', method: 'POST', headers: { ...userHeader, Origin: origin }, status: 200 },
    { label: 'write without origin', method: 'POST', headers: userHeader, status: 403 },
    { label: 'cross-site write with session', method: 'POST', headers: { ...userHeader, Origin: 'https://other.example.com' }, status: 403 },
    { label: 'null origin', method: 'POST', headers: { ...userHeader, Origin: 'null' }, status: 403 },
    { label: 'ambiguous user header', method: 'GET', headers: { 'X-Auth-Request-User': 'operator, spoofed' }, status: 401 },
  ])('$label', async ({ method, headers, status }) => {
    const response = await fetch(`${base}/api/example`, { method, headers: headers as Record<string, string> });
    expect(response.status).toBe(status);
  });

  test.each([
    { label: 'authenticated same-origin handshake', headers: { ...userHeader, Origin: origin }, status: undefined },
    { label: 'missing websocket origin', headers: userHeader, status: 403 },
    { label: 'foreign websocket origin', headers: { ...userHeader, Origin: 'https://other.example.com' }, status: 403 },
    { label: 'anonymous websocket', headers: { Origin: origin }, status: 401 },
  ])('$label', ({ headers, status }) => {
    const normalizedHeaders = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
    expect(externalAuthError({ headers: normalizedHeaders, method: 'GET' }, true)?.status).toBe(status);
  });
});

describe('external authentication startup configuration', () => {
  test.each(['', 'https://example.com/webui', 'https://user:password@example.com', 'https://example.com?query=1', 'file:///tmp/napig'])('rejects missing or non-origin configuration: %s', value => {
    expect(() => configureExternalAuth(value)).toThrow();
    expect(externalAuthError({ headers: { 'x-auth-request-user': 'operator' }, method: 'GET' })?.status).toBe(503);
    configureExternalAuth(origin);
  });
});
