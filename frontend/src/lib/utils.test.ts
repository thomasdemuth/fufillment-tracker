import { cn } from './utils'

describe('cn', () => {
  it('merges tailwind classes', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
    expect(cn('a', false && 'b', 'c')).toBe('a c')
  })
})
