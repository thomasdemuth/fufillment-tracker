import { headerSignature, scoreHeader, suggestMapping, tokenSetRatio } from './mapping'

describe('mapping', () => {
  it('token set ratio behaves like rapidfuzz for the cases we rely on', () => {
    expect(tokenSetRatio('ship to name', 'name')).toBe(100)
    expect(tokenSetRatio('abc', 'xyz')).toBe(0)
    expect(tokenSetRatio('tracking', 'tracking')).toBe(100)
  })
  it('scores exact synonyms highest', () => {
    expect(scoreHeader('Tracking Number', 'tracking_number')).toBe(1)
    expect(scoreHeader('Ship To Name', 'recipient_name')).toBeGreaterThanOrEqual(0.85)
    expect(scoreHeader('Widget count', 'tracking_number')).toBeLessThan(0.6)
  })
  it('suggests a mapping from typical Shopify-style headers', () => {
    const m = suggestMapping(['Name', 'Email', 'Shipping Address', 'Shipping City', 'Shipping Province', 'Shipping Zip', 'Tracking Number', 'Order #'])
    expect(m.tracking_number).toBe('Tracking Number')
    expect(m.recipient_name).toBe('Name')
    expect(m.email).toBe('Email')
    expect(m.address1).toBe('Shipping Address')
    expect(m.city).toBe('Shipping City')
    expect(m.state).toBe('Shipping Province')
    expect(m.postal_code).toBe('Shipping Zip')
    expect(m.order_ref).toBe('Order #')
  })
  it('finds the tracking column by content and a combined City, ST ZIP column', () => {
    const rows = [
      ['Ann', '9400111899223456789012', 'Austin, TX 78701'],
      ['Bob', '9400111899223456789029', 'Denver, CO 80202'],
      ['Cy', '9400111899223456789036', 'Miami, FL 33101'],
    ]
    const m = suggestMapping(['Who', 'Code', 'Where'], rows)
    expect(m.tracking_number).toBe('Code')
    expect(m.city_state_zip).toBe('Where')
  })
  it('header signature ignores order and case', () => {
    expect(headerSignature(['Name', 'ZIP'])).toBe(headerSignature(['zip', 'name']))
    expect(headerSignature(['Name'])).not.toBe(headerSignature(['Email']))
  })
})
