import { getNapigConfig } from 'napcat-common/src/config';
import type { IncomingMessage } from 'node:http';

type AuthRequest = Pick<IncomingMessage, 'headers' | 'method'>;

let publicOrigin: string | undefined;

// The gateway must replace this header and prevent direct access to the backend.
export const AUTH_USER_HEADER = 'x-auth-request-user';

export function configureExternalAuth (value = getNapigConfig().webui['public-url']): string {
  publicOrigin = undefined;
  if (!value) throw new Error('webui.public-url is required for external WebUI authentication');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
    url.pathname !== '/' || url.search || url.hash) {
    throw new Error('webui.public-url must be an HTTP(S) origin without a path, credentials, query or fragment');
  }
  publicOrigin = url.origin;
  return publicOrigin;
}

export function getExternalAuthUser (request: AuthRequest): string | undefined {
  const user = request.headers[AUTH_USER_HEADER];
  return typeof user === 'string' && user.trim() && !/[\r\n,]/.test(user) ? user.trim() : undefined;
}

export function externalAuthError (request: AuthRequest, websocket = false): { status: number; message: string; } | undefined {
  if (!publicOrigin) return { status: 503, message: 'External authentication is not configured' };
  if (!getExternalAuthUser(request)) return { status: 401, message: 'Unauthorized' };
  const origin = request.headers.origin;
  const requiresOrigin = websocket || !['GET', 'HEAD', 'OPTIONS'].includes(request.method || 'GET');
  if ((requiresOrigin || origin !== undefined) && origin !== publicOrigin) {
    return { status: 403, message: 'Cross-origin WebUI requests are not allowed' };
  }
  return undefined;
}
