import type { CircleLayerSpecification, ExpressionSpecification, FillLayerSpecification, HeatmapLayerSpecification, LineLayerSpecification, SymbolLayerSpecification } from 'maplibre-gl'
import { STATUS_ORDER, STATUS_META, type Status } from './status'

export const SRC_POINTS = 'shipments'
export const SRC_RAW = 'shipments-raw'
export const SRC_STATES = 'states'

/** Colors for one theme. Built from STATUS_META so the map and the UI never drift apart. */
export interface MapPalette {
  status: Record<Status, string>
  ink: string
  surface: string
  accent: string
  accentRamp: [string, string, string, string, string]
  heat: [string, string, string, string]
  outline: string
}

export function mapPalette(dark: boolean): MapPalette {
  const status = Object.fromEntries(STATUS_ORDER.map((s) => [s, dark ? STATUS_META[s].dark : STATUS_META[s].light])) as Record<Status, string>
  return dark
    ? {
        status,
        ink: '#ece7dd',
        surface: '#1c1a17',
        accent: '#3fb3a6',
        accentRamp: ['rgba(63,179,166,0.10)', 'rgba(63,179,166,0.28)', 'rgba(63,179,166,0.45)', 'rgba(63,179,166,0.65)', 'rgba(63,179,166,0.85)'],
        heat: ['rgba(63,179,166,0)', 'rgba(63,179,166,0.55)', 'rgba(201,149,40,0.8)', 'rgba(214,90,80,0.95)'],
        outline: 'rgba(236,231,221,0.35)',
      }
    : {
        status,
        ink: '#1c1a17',
        surface: '#fffdf9',
        accent: '#0e5a55',
        accentRamp: ['rgba(14,90,85,0.07)', 'rgba(14,90,85,0.22)', 'rgba(14,90,85,0.40)', 'rgba(14,90,85,0.60)', 'rgba(14,90,85,0.82)'],
        heat: ['rgba(14,90,85,0)', 'rgba(14,138,122,0.55)', 'rgba(212,154,10,0.8)', 'rgba(200,67,58,0.95)'],
        outline: 'rgba(28,26,23,0.35)',
      }
}

/** Cluster properties: one counter per status so a cluster can be colored by its dominant status. */
export function clusterProperties(): Record<string, ExpressionSpecification> {
  const out: Record<string, ExpressionSpecification> = {}
  for (const s of STATUS_ORDER) out[s] = ['+', ['case', ['==', ['get', 's'], s], 1, 0]]
  out.hot = ['+', ['case', ['any', ['==', ['get', 's'], 'exception'], ['==', ['get', 's'], 'returned']], 1, 0]]
  return out
}

/** Color expression for a single point by status. */
export function statusColorExpression(p: MapPalette): ExpressionSpecification {
  const pairs: string[] = []
  for (const s of STATUS_ORDER) pairs.push(s, p.status[s])
  return ['match', ['get', 's'], ...pairs, p.status.unknown] as unknown as ExpressionSpecification
}

/** Cluster fill: the status with the highest count (exceptions are flagged by the ring, not the fill). */
export function clusterColorExpression(p: MapPalette): ExpressionSpecification {
  const order: Status[] = ['exception', 'out_for_delivery', 'in_transit', 'label_created', 'delivered', 'returned', 'unknown']
  const argmax = (cands: Status[]): ExpressionSpecification => {
    if (cands.length === 1) return p.status[cands[0]] as unknown as ExpressionSpecification
    const [head, ...rest] = cands
    const geAll: ExpressionSpecification = ['all', ...rest.map((r) => ['>=', ['get', head], ['get', r]] as ExpressionSpecification)]
    return ['case', geAll, p.status[head], argmax(rest)] as ExpressionSpecification
  }
  return argmax(order)
}

export function clusterLayer(p: MapPalette): CircleLayerSpecification {
  return {
    id: 'clusters',
    type: 'circle',
    source: SRC_POINTS,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': clusterColorExpression(p),
      'circle-opacity': 0.92,
      'circle-radius': ['interpolate', ['linear'], ['get', 'point_count'], 2, 13, 10, 17, 50, 22, 200, 30, 1000, 38],
      // a red ring means "contains at least one exception or return"
      'circle-stroke-width': ['case', ['>', ['get', 'hot'], 0], 3, 2],
      'circle-stroke-color': ['case', ['>', ['get', 'hot'], 0], p.status.exception, p.surface],
    },
  }
}

export function clusterCountLayer(p: MapPalette): SymbolLayerSpecification {
  return {
    id: 'cluster-count',
    type: 'symbol',
    source: SRC_POINTS,
    filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12, 'text-font': ['Noto Sans Bold'], 'text-allow-overlap': true },
    paint: { 'text-color': p.surface },
  }
}

export function pointLayer(p: MapPalette): CircleLayerSpecification {
  return {
    id: 'points',
    type: 'circle',
    source: SRC_POINTS,
    filter: ['!', ['has', 'point_count']],
    paint: {
      // returned = hollow marker (same hue as exception, distinguished by shape)
      'circle-color': ['case', ['==', ['get', 's'], 'returned'], p.surface, statusColorExpression(p)],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 4.5, 8, 6, 12, 8],
      // out-for-delivery = ink ring; returned = colored ring; others = surface ring
      'circle-stroke-width': ['match', ['get', 's'], 'out_for_delivery', 2, 'returned', 2.5, ['case', ['==', ['get', 'p'], 'street'], 1, 1.5]],
      'circle-stroke-color': ['match', ['get', 's'], 'out_for_delivery', p.ink, 'returned', p.status.returned, p.surface],
      'circle-opacity': 0.95,
    },
  }
}

export function heatmapLayer(p: MapPalette): HeatmapLayerSpecification {
  return {
    id: 'heat',
    type: 'heatmap',
    source: SRC_RAW,
    maxzoom: 12,
    paint: {
      'heatmap-weight': ['coalesce', ['get', 'w'], 1],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.8, 9, 2.5],
      'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, p.heat[0], 0.25, p.heat[1], 0.6, p.heat[2], 1, p.heat[3]],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 12, 5, 22, 9, 40],
      'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.9, 12, 0.4],
    },
  }
}

export function stateFillLayer(p: MapPalette): FillLayerSpecification {
  return {
    id: 'state-fill',
    type: 'fill',
    source: SRC_STATES,
    paint: {
      'fill-color': ['interpolate', ['linear'], ['coalesce', ['feature-state', 'count'], 0], 0, p.accentRamp[0], 1, p.accentRamp[1], 10, p.accentRamp[2], 50, p.accentRamp[3], 200, p.accentRamp[4]],
      'fill-outline-color': p.outline,
    },
  }
}

export function stateLineLayer(p: MapPalette): LineLayerSpecification {
  return {
    id: 'state-line',
    type: 'line',
    source: SRC_STATES,
    paint: {
      'line-color': ['case', ['boolean', ['feature-state', 'hover'], false], p.accent, p.outline],
      'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 2.5, 0.8],
    },
  }
}

export function stateLabelLayer(p: MapPalette): SymbolLayerSpecification {
  return {
    id: 'state-label',
    type: 'symbol',
    source: SRC_STATES,
    layout: {
      'text-field': ['concat', ['get', 'postal'], '\n', ['to-string', ['coalesce', ['feature-state', 'count'], 0]]],
      'text-size': 11,
      'text-font': ['Noto Sans Bold'],
      'text-allow-overlap': false,
    },
    paint: { 'text-color': p.ink, 'text-halo-color': p.surface, 'text-halo-width': 1.2 },
  }
}

/** Transit-path layers for the detail map. */
export function pathLineLayer(p: MapPalette): LineLayerSpecification {
  return {
    id: 'path-line',
    type: 'line',
    source: 'path',
    filter: ['all', ['==', ['geometry-type'], 'LineString'], ['!=', ['get', 'future'], true]],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': p.accent, 'line-width': 3, 'line-opacity': 0.9 },
  }
}

export function pathFutureLineLayer(p: MapPalette): LineLayerSpecification {
  return {
    id: 'path-future',
    type: 'line',
    source: 'path',
    filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'future'], true]],
    layout: { 'line-cap': 'round' },
    paint: { 'line-color': p.status.label_created, 'line-width': 2.5, 'line-dasharray': [1.5, 2] },
  }
}

export function pathPointLayer(p: MapPalette): CircleLayerSpecification {
  return {
    id: 'path-points',
    type: 'circle',
    source: 'path',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-radius': ['match', ['get', 'kind'], 'origin', 7, 'destination', 9, 5.5],
      'circle-color': ['match', ['get', 'kind'], 'origin', p.status.label_created, 'destination', statusColorExpression(p), p.accent],
      'circle-stroke-width': 2,
      'circle-stroke-color': p.surface,
    },
  }
}

export function pathLabelLayer(p: MapPalette): SymbolLayerSpecification {
  return {
    id: 'path-labels',
    type: 'symbol',
    source: 'path',
    filter: ['==', ['geometry-type'], 'Point'],
    layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-font': ['Noto Sans Regular'], 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-optional': true },
    paint: { 'text-color': p.ink, 'text-halo-color': p.surface, 'text-halo-width': 1.2 },
  }
}
