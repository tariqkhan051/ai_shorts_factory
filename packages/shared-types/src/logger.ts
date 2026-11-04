export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export type StructuredLogFields = Record<string, string | number | boolean | null | undefined>;

function resolveLevel(env: NodeJS.ProcessEnv = process.env): LogLevel {
  const raw = (env.LOG_LEVEL ?? 'info').toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw;
  }
  return 'info';
}

export function createLogger(service: string, env: NodeJS.ProcessEnv = process.env) {
  const minLevel = resolveLevel(env);

  function write(level: LogLevel, message: string, fields?: StructuredLogFields): void {
    if (LEVEL_RANK[level] < LEVEL_RANK[minLevel]) return;
    const payload = {
      ts: new Date().toISOString(),
      level,
      service,
      message,
      ...fields,
    };
    const line = JSON.stringify(payload);
    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.info(line);
    }
  }

  return {
    debug: (message: string, fields?: StructuredLogFields) => write('debug', message, fields),
    info: (message: string, fields?: StructuredLogFields) => write('info', message, fields),
    warn: (message: string, fields?: StructuredLogFields) => write('warn', message, fields),
    error: (message: string, fields?: StructuredLogFields) => write('error', message, fields),
  };
}

export type Logger = ReturnType<typeof createLogger>;
