import { buildHandoffLink } from './ShareButton'

const origin = 'http://localhost:8000'

describe('buildHandoffLink (self-hosted UI)', () => {
  it('prefers hosted UI + public server', () => {
    const r = buildHandoffLink({ lan_url: 'http://192.168.1.5:8000', public_url: 'https://t.example.com', hosted_ui_url: 'https://ui.pages.dev', auth_required: false }, '/shipments/12?x=1', origin)
    expect(r.url).toBe('https://ui.pages.dev/shipments/12?x=1&server=https%3A%2F%2Ft.example.com')
  })
  it('falls back to public server, then LAN, then local', () => {
    expect(buildHandoffLink({ lan_url: 'http://192.168.1.5:8000', public_url: 'https://t.example.com', hosted_ui_url: null, auth_required: false }, '/board', origin).url).toBe('https://t.example.com/board')
    expect(buildHandoffLink({ lan_url: 'http://192.168.1.5:8000', public_url: null, hosted_ui_url: 'https://ui.pages.dev', auth_required: false }, '/board', origin).url).toBe('http://192.168.1.5:8000/board')
    expect(buildHandoffLink({ lan_url: null, public_url: null, hosted_ui_url: null, auth_required: false }, '/map?status=delivered', origin).url).toBe('http://localhost:8000/map?status=delivered')
  })
})
