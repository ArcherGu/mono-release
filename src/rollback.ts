import type { Logger } from './log'
import { createLogger } from './log'

export type RollbackFn = () => (Promise<void> | void)

export class Rollback {
  private rollbackList: RollbackFn[] = []
  private logger: Logger

  constructor() {
    this.logger = createLogger()
  }

  add(fn: RollbackFn) {
    this.rollbackList.unshift(fn)
  }

  async rollback() {
    this.rollbackList.length > 0 && this.logger.warn('Rollbacking...')
    for (const fn of this.rollbackList)
      await fn()
  }
}
