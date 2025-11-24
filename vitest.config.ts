import type { TestUserConfig } from 'vitest/node'

const config: { test: TestUserConfig } = {
  test: {
    testTimeout: 50000,
  },
}

export default config
