import winston from 'winston';
import { Paths } from './paths';

export function createLogger(paths: Paths): winston.Logger {
  paths.ensureDirectories();

  return winston.createLogger({
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    transports: [
      new winston.transports.File({
        filename: paths.getLogPath(),
        maxsize: 5 * 1024 * 1024,
        maxFiles: 3,
      }),
    ],
  });
}
