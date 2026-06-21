import { afterEach, describe, expect, test } from 'bun:test'
import { allowedDashboardOrigins, isOriginAllowed, isVercelAppOrigin } from './cors.js'

const env = process.env

afterEach(() => {
  process.env = { ...env }
})

describe('isVercelAppOrigin', () => {
  test('accepts https vercel.app hosts', () => {
    expect(isVercelAppOrigin('https://wavi-fawn.vercel.app')).toBe(true)
    expect(isVercelAppOrigin('https://wavi-git-main-user.vercel.app')).toBe(true)
  })

  test('rejects non-vercel hosts', () => {
    expect(isVercelAppOrigin('https://evil.example.com')).toBe(false)
    expect(isVercelAppOrigin('http://wavi-fawn.vercel.app')).toBe(false)
  })
})

describe('isOriginAllowed', () => {
  test('allows configured dashboard URL', () => {
    process.env.NODE_ENV = 'production'
    process.env.DASHBOARD_URL = 'https://wavi-fawn.vercel.app'
    expect(isOriginAllowed('https://wavi-fawn.vercel.app')).toBe(true)
  })

  test('allows any vercel.app origin in production', () => {
    process.env.NODE_ENV = 'production'
    process.env.DASHBOARD_URL = 'https://old-name.vercel.app'
    expect(isOriginAllowed('https://wavi-fawn.vercel.app')).toBe(true)
  })

  test('rejects unknown origins in development', () => {
    process.env.NODE_ENV = 'development'
    process.env.DASHBOARD_URL = 'https://wavi-fawn.vercel.app'
    expect(isOriginAllowed('https://wavi-fawn.vercel.app')).toBe(true)
    expect(isOriginAllowed('https://other.vercel.app')).toBe(false)
  })

  test('parses comma-separated dashboard URLs', () => {
    process.env.NODE_ENV = 'development'
    process.env.DASHBOARD_URL = 'https://a.vercel.app, https://b.vercel.app'
    expect(allowedDashboardOrigins()).toContain('https://a.vercel.app')
    expect(allowedDashboardOrigins()).toContain('https://b.vercel.app')
    expect(isOriginAllowed('https://b.vercel.app')).toBe(true)
  })
})
