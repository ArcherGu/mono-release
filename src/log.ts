// Borrowed from https://github.com/egoist/tsup/blob/main/src/log.ts
import * as colors from 'colorette'

type LOG_TYPE = 'info' | 'success' | 'error' | 'warn'

export function colorize(type: LOG_TYPE, data: any, onlyImportant = false) {
  if (onlyImportant && (type === 'info' || type === 'success'))
    return data

  const color
    = type === 'info'
      ? 'blue'
      : type === 'error'
        ? 'red'
        : type === 'warn'
          ? 'yellow'
          : 'green'
  return colors[color](data)
}

export function makeLabel(name: string | undefined, input: string) {
  return [
    name && `${colors.dim('[')}${name.toUpperCase()}${colors.dim(']')}`,
    `[${colors.green(input)}]`,
  ]
    .filter(Boolean)
    .join(' ')
}

export type Logger = ReturnType<typeof createLogger>

export const TAG = 'MOR'

export function createLogger(name?: string) {
  return {
    setName(_name: string) {
      name = _name
    },

    success(label: string, ...args: any[]) {
      return this.log(label, 'success', ...args)
    },

    info(label: string, ...args: any[]) {
      return this.log(label, 'info', ...args)
    },

    error(label: string, ...args: any[]) {
      return this.log(label, 'error', ...args)
    },

    warn(label: string, ...args: any[]) {
      return this.log(label, 'warn', ...args)
    },

    break() {
      console.log('\n')
    },

    log(
      label: string,
      type: 'info' | 'success' | 'error' | 'warn',
      ...data: unknown[]
    ) {
      switch (type) {
        case 'error': {
          return console.error(
            makeLabel(name, label),
            ...data.map(item => colorize(type, item, true)),
          )
        }
        default:
          console.log(
            makeLabel(name, label),
            ...data.map(item => colorize(type, item, true)),
          )
      }
    },
  }
}
