import moment from 'moment';
import winston from 'winston';

const { combine, printf, colorize, align, errors, metadata } = winston.format;

const myCustomLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    verbose: 4,
    debug: 5,
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'blue',
    verbose: 'black',
    debug: 'magenta',
  },
};

winston.addColors(myCustomLevels.colors);

const formatMeta = (meta: any) => {
  // You can format the splat yourself
  const splat = meta[Symbol.for('splat')];
  if (splat?.length) {
    return splat.length === 1
      ? JSON.stringify(splat[0])
      : splat.map((s: any) => JSON.stringify(s)).join(' ');
  }
  return '';
};
const padLoggerName = (name: string, length: number) => {
  return name.padEnd(length, '>');
};

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels: myCustomLevels.levels,
  format: combine(
    errors({ stack: true }),
    colorize({ all: true }),
    metadata({ fillExcept: ['message', 'level', 'timestamp', 'label'] }),
    align(),
    printf((info) => {
      const { timestamp, level, message: logMessage, ...metadata } = info;
      const { loggerName } = metadata.metadata as { loggerName: string };

      const msg = `[${moment().utc().format('YYYY-MM-DD HH:mm:ss')}] [${level}] ${padLoggerName(
        '[' + loggerName + ']',
        60
      )} ${logMessage} ${formatMeta(metadata)}`;

      return msg;
    })
  ),
  transports: [
    new winston.transports.Console(),
    // new winston.transports.File({ filename: "logs.log" }),
  ],
});

export const getLogger = (module: NodeModule | string) => {
  // if no custom name provided, use filename and parent folder

  const name = typeof module === 'string' ? module : module.filename.split('/').slice(-2).join('/');

  return logger.child({ loggerName: name });
};
