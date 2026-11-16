import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { getLoginDiagnostics } from './login-diagnostics';

type Fields = Record<string, unknown>;
interface PacketMetadata {
  type: 0 | 1;
  cmd: string;
  seq: number;
  bytes: number;
}

/** Native callback shapes are partly unknown: retain only documented scalar codes. */
export function summarizeLoginArguments (args: unknown[]): Fields {
  const codeKeys = ['state', 'status', 'code', 'errCode', 'errType', 'result', 'step', 'loginState', 'msfStatus'];
  return {
    argumentCount: args.length,
    arguments: args.slice(0, 4).map(arg => {
      if (typeof arg === 'number' && Number.isFinite(arg)) return arg;
      if (typeof arg === 'boolean') return arg;
      if (typeof arg === 'string') return { type: 'string', length: arg.length };
      if (!arg || typeof arg !== 'object') return { type: typeof arg };
      const codes: Fields = {};
      for (const key of codeKeys) {
        const value = (arg as Fields)[key];
        if (typeof value === 'number' && Number.isFinite(value)) codes[key] = value;
        else if (typeof value === 'string' && /^-?\d{1,10}$/.test(value)) codes[key] = value;
      }
      return { type: Array.isArray(arg) ? 'array' : 'object', codes };
    }),
  };
}

/** Bounded, five-minute history. No packet bodies, account IDs or credentials. */
export class ConnectionDiagnostics {
  private readonly packets = new Map<string, { at: number; timestamp: string; direction: string; command: string; count: number; lastSeq: number; lastBytes: number; }>();
  private readonly samples: Array<{ at: number; value: Fields; }> = [];
  private lastSendAt?: number;
  private lastReceiveAt?: number;
  private evictedBuckets = 0;

  constructor (
    private readonly now = () => performance.now(),
    private readonly capacity = 256,
    private readonly windowMs = 300_000
  ) {}

  private prune (at: number) {
    for (const [key, entry] of this.packets) {
      if (at - entry.at <= this.windowMs) break;
      this.packets.delete(key);
    }
  }

  recordPacket ({ type, cmd, seq, bytes }: PacketMetadata) {
    const at = this.now();
    if (type === 0) this.lastSendAt = at;
    else this.lastReceiveAt = at;
    this.prune(at);
    // Command names come from native code; reject unexpected text rather than dump it.
    const command = /^[A-Za-z0-9_.:/-]{1,128}$/.test(cmd) ? cmd : '<invalid-command>';
    const key = `${Math.floor(at / 1000)}:${type}:${command}`;
    const previous = this.packets.get(key);
    if (previous) {
      previous.count++;
      previous.lastSeq = seq;
      previous.lastBytes = bytes;
      return;
    }
    if (this.packets.size >= this.capacity) {
      this.packets.delete(this.packets.keys().next().value!);
      this.evictedBuckets++;
    }
    this.packets.set(key, { at, timestamp: new Date().toISOString(), direction: type === 0 ? 'send' : 'receive', command, count: 1, lastSeq: seq, lastBytes: bytes });
  }

  activity () {
    const at = this.now();
    return {
      lastSendAgoMs: this.lastSendAt === undefined ? null : Math.round(at - this.lastSendAt),
      lastReceiveAgoMs: this.lastReceiveAt === undefined ? null : Math.round(at - this.lastReceiveAt),
    };
  }

  recordSample (sample: Fields) {
    this.samples.push({ at: this.now(), value: sample });
    if (this.samples.length > 20) this.samples.shift();
  }

  snapshot () {
    this.prune(this.now());
    return { ...this.activity(), evictedBuckets: this.evictedBuckets, packetBuckets: [...this.packets.values()], samples: this.samples.filter(sample => this.now() - sample.at <= this.windowMs).map(sample => sample.value) };
  }
}

export const connectionDiagnostics = new ConnectionDiagnostics();

interface DiagnosticLogger {
  log: (...args: unknown[]) => void;
  logWarn: (...args: unknown[]) => void;
}

let monitoringStarted = false;
export function startConnectionDiagnostics (
  logger: DiagnosticLogger,
  readMsfStatus: () => number,
  readLoginPhase: () => string
) {
  if (monitoringStarted) return;
  monitoringStarted = true;
  const delay = monitorEventLoopDelay({ resolution: 100 });
  delay.enable();
  let lastSampleAt = performance.now();
  logger.log('[Core] [ConnectionDiagnostics] started', { ...getLoginDiagnostics(), intervalMs: 15_000, windowMs: 300_000, maxPacketBuckets: 256, packetCoverage: 'existing-native-hook-only' });
  const timer = setInterval(() => {
    const at = performance.now();
    const sample = {
      ...getLoginDiagnostics(readMsfStatus),
      loginPhase: readLoginPhase(),
      ...connectionDiagnostics.activity(),
      eventLoopMaxMs: Math.round(delay.max / 1e6),
      eventLoopP99Ms: Math.round(delay.percentile(99) / 1e6),
      intervalElapsedMs: Math.round(at - lastSampleAt),
    };
    connectionDiagnostics.recordSample(sample);
    logger.log('[Core] [ConnectionSample]', sample);
    delay.reset();
    lastSampleAt = at;
  }, 15_000);
  timer.unref();
}

/** Emit before the old Worker is replaced; chunk rows to keep log lines manageable. */
export function dumpConnectionDiagnostics (logger: DiagnosticLogger, trigger: string) {
  const { packetBuckets, samples, ...summary } = connectionDiagnostics.snapshot();
  const context = getLoginDiagnostics();
  logger.logWarn('[Core] [ConnectionHistory]', { ...context, trigger, ...summary, packetBuckets: packetBuckets.length, samples: samples.length });
  for (const [kind, entries] of [['packets', packetBuckets], ['samples', samples]] as const) {
    for (let offset = 0; offset < entries.length; offset += 8) {
      logger.logWarn('[Core] [ConnectionHistoryChunk]', { diagnosticId: context.diagnosticId, trigger, kind, offset, entries: entries.slice(offset, offset + 8) });
    }
  }
}
