import { describe, expect, it } from 'vitest'
import { Rollback } from '../src/rollback'

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('rollback', () => {
  it('should rollback', async () => {
    const rollback = new Rollback()

    let a = 'foo'
    let b = 'bar'
    let c = 'baz'
    let d = 'qux'

    a = 'bar'
    b = 'foo'

    rollback.add(() => {
      a = 'foo'
      b = 'bar'
    })

    c = 'qux'
    d = 'baz'

    rollback.add(async () => {
      await sleep(100)
      c = 'baz'
      d = 'qux'
    })

    await rollback.rollback()

    expect(a).toBe('foo')
    expect(b).toBe('bar')
    expect(c).toBe('baz')
    expect(d).toBe('qux')
  })
})
