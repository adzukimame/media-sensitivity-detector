type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getConfiguredLogLevel(): LogLevel {
  const envLevel = process.env['LOG_LEVEL']?.toLowerCase();
  if (envLevel && envLevel in LOG_LEVEL_PRIORITY) {
    return envLevel as LogLevel;
  }
  return 'info';
}

function shouldLog(level: LogLevel): boolean {
  const configuredLevel = getConfiguredLogLevel();
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[configuredLevel];
}

type LogContext = {
  operation: string;
  duration?: number;
  url?: string;
  error?: string;
  errorStack?: string | undefined;
  [key: string]: unknown;
};

type LogEntry = LogContext & {
  timestamp: string;
  level: LogLevel;
  message: string;
};

function formatError(err: unknown): { error: string; errorStack?: string | undefined } {
  if (err instanceof Error) {
    return {
      error: err.message,
      errorStack: err.stack,
    };
  }
  return { error: String(err) };
}

function log(level: LogLevel, message: string, context?: LogContext): void {
  if (!shouldLog(level)) {
    return;
  }

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    operation: context?.operation ?? 'unknown',
    ...context,
  };

  const output = JSON.stringify(entry);

  /* eslint-disable no-console */
  switch (level) {
    case 'debug':
      console.debug(output);
      break;
    case 'info':
      console.log(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    case 'error':
      console.error(output);
      break;
  }
  /* eslint-enable no-console */
}

export const logger = {
  debug: (message: string, context?: LogContext): void => {
    log('debug', message, context);
  },
  info: (message: string, context?: LogContext): void => {
    log('info', message, context);
  },
  warn: (message: string, context?: LogContext): void => {
    log('warn', message, context);
  },
  error: (message: string, context?: LogContext): void => {
    log('error', message, context);
  },
  formatError,
};
