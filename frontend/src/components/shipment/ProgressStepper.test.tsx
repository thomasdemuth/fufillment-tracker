import { deriveStepper } from './ProgressStepper'

const base = {
  status: 'unknown',
  status_raw: null,
  expected_delivery: null,
  delivered_at: null,
  last_event_at: null,
  last_event_desc: null,
  last_event_place: null,
  last_polled_at: null,
  attention_flag: null,
  events: [] as { normalized_status: string; event_at: string | null }[],
}

describe('deriveStepper', () => {
  it('never polled', () => {
    const m = deriveStepper(base)
    expect(m.reached).toBe(-1)
    expect(m.headline).toBe('Not checked yet')
    expect(m.active).toBe(false)
  })
  it('label created', () => {
    const m = deriveStepper({ ...base, status: 'label_created', last_polled_at: 'x' })
    expect(m.reached).toBe(0)
    expect(m.active).toBe(true)
  })
  it('in transit with expected date', () => {
    const m = deriveStepper({
      ...base,
      status: 'in_transit',
      expected_delivery: '2099-03-04',
      events: [
        { normalized_status: 'label_created', event_at: '2099-03-01T10:00:00' },
        { normalized_status: 'in_transit', event_at: '2099-03-02T10:00:00' },
      ],
    })
    expect(m.reached).toBe(1)
    expect(m.times[0]).toBe('2099-03-01T10:00:00')
    expect(m.times[1]).toBe('2099-03-02T10:00:00')
    expect(m.headline).toMatch(/^Arriving /)
  })
  it('out for delivery', () => {
    expect(deriveStepper({ ...base, status: 'out_for_delivery' }).headline).toBe('Out for delivery today')
  })
  it('delivered fills all steps', () => {
    const m = deriveStepper({ ...base, status: 'delivered', delivered_at: '2099-03-04T11:49:00' })
    expect(m.reached).toBe(3)
    expect(m.times[3]).toBe('2099-03-04T11:49:00')
    expect(m.headline).toMatch(/^Delivered /)
  })
  it('exception keeps furthest step and flags problem', () => {
    const m = deriveStepper({
      ...base,
      status: 'exception',
      events: [
        { normalized_status: 'in_transit', event_at: '2099-03-02T10:00:00' },
        { normalized_status: 'out_for_delivery', event_at: '2099-03-03T08:00:00' },
        { normalized_status: 'exception', event_at: '2099-03-03T14:00:00' },
      ],
    })
    expect(m.reached).toBe(2)
    expect(m.problem).toBe('exception')
    expect(m.headline).toBe('Delivery problem')
  })
  it('pickup exception has its own headline', () => {
    expect(deriveStepper({ ...base, status: 'exception', attention_flag: 'pickup' }).headline).toBe('Waiting for pickup')
  })
  it('returned', () => {
    const m = deriveStepper({ ...base, status: 'returned' })
    expect(m.problem).toBe('returned')
    expect(m.reached).toBe(1)
  })
})
