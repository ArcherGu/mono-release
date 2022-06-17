import colors from 'picocolors'

export type RollbackFn = () => (Promise<void> | void)

export class Rollback {
  private rollbackList: RollbackFn[] = []
  add(fn: RollbackFn) {
    this.rollbackList.unshift(fn)
  }

  async rollback() {
    Rollback.printInfo('Rollbacking...')
    for (const fn of this.rollbackList)
      await fn()
  }

  static printInfo(info: string) {
    console.log(
      colors.yellow(info),
    )
  }
}
