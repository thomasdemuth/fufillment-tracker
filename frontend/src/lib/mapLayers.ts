import type { CircleLayerSpecification, ExpressionSpecification, FillLayerSpecification, HeatmapLayerSpecification, LineLayerSpecification, SymbolLayerSpecification } from 'maplibre-gl'
import { STATUS_ORDER, STATUS_META, type Status } from './status'

export const SRC_POINTS = 'shipments'
export const SRC_RAW = 'shipments-raw'
export const SRC_STATES = 'states'

/** Cluster properties: one counter per status so a cluster can be colored by its dominant status. */
export function clusterProperties(): Record<string, ExpressionSpecification> {
  const out: Record<string, ExpressionSpecification> = {}
  for (const s of STATUS_ORDER) out[s] = ['+', ['case', ['==', ['get', 's'], s], 1, 0]]
  out.hot = ['+', ['case', ['==', ['get', 's'], 'exception'], 1, 0]]
  return out
}

/** Color expression for a single point by status. */
export function statusColorExpression(): ExpressionSpecification {
  const pairs: (string | ExpressionSpecification)[] = []
  for (const s of STATUS_ORDER) pairs.push(s, STATUS_META[s].color)
  return ['match', ['get', 's'], ...pairs, STATUS_META.unknown.color] as unknown as ExpressionSpecification
}

/** Color of a cluster: exception if any exception inside; otherwise the status with the highest count. */
export function clusterColorExpression(): ExpressionSpecification {
  const order: Status[] = ['out_for_delivery', 'in_transit', 'label_created', 'delivered', 'returned', 'unknown']
  // Build nested: if hot>0 -> red; else pick argmax over order via chained case comparisons.
  const argmax = (cands: Status[]): ExpressionSpecification => {
    if (cands.length === 1) return STATUS_META[cands[0]].color as unknown as ExpressionSpecification
    const [head, ...rest] = cands
    const geAll: ExpressionSpecification = ['all', ...rest.map((r) => ['>=', ['get', head], ['get', r]] as ExpressionSpecification)]
    return ['case', geAll, STATUS_META[head].color, argmax(rest)] as ExpressionSpecification
  }
  return ['case', ['>', ['get', 'hot'], 0], STATUS_META.exception.color, argmax(order)] as ExpressionSpecification
}

export function clusterLayer(): CircleLayerSpecification {
  return {
    id: 'clusters',
    type: 'circle',
    source: SRC_POINTS,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': clusterColorExpression(),
      'circle-opacity': 0.85,
      'circle-radius': ['interpolate', ['linear'], ['get', 'point_count'], 2, 14, 10, 18, 50, 24, 200, 32, 1000, 40],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
    },
  }
}

export function clusterCountLayer(): SymbolLayerSpecification {
  return {
    id: 'cluster-count',
    type: 'symbol',
    source: SRC_POINTS,
    filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12, 'text-font': ['Noto Sans Bold'], 'text-allow-overlap': true },
    paint: { 'text-color': '#ffffff' },
  }
}

export function pointLayer(): CircleLayerSpecification {
  return {
    id: 'points',
    type: 'circle',
    source: SRC_POINTS,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': statusColorExpression(),
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 4, 8, 6, 12, 8],
      'circle-stroke-width': ['case', ['==', ['get', 'p'], 'street'], 1, 2],
      'circle-stroke-color': ['case', ['==', ['get', 'p'], 'street'], '#ffffff', 'rgba(255,255,255,0.7)'],
      'circle-opacity': 0.9,
    },
  }
}

export function heatmapLayer(): HeatmapLayerSpecification {
  return {
    id: 'heat',
    type: 'heatmap',
    source: SRC_RAW,
    maxzoom: 12,
    paint: {
      'heatmap-weight': ['coalesce', ['get', 'w'], 1],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.8, 9, 2.5],
      'heatmap-color': [
        'interpolate',
        ['linear'],
        ['heatmap-density'],
        0, 'rgba(20,184,166,0)',
        0.2, 'rgba(45,212,191,0.55)',
        0.45, 'rgba(250,204,21,0.75)',
        0.7, 'rgba(249,115,22,0.85)',
        1, 'rgba(220,38,38,0.95)',
      ],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 12, 5, 22, 9, 40],
      'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.9, 12, 0.4],
    },
  }
}

export function stateFillLayer(): FillLayerSpecification {
  return {
    id: 'state-fill',
    type: 'fill',
    source: SRC_STATES,
    paint: {
      'fill-color': [
        'interpolate',
        ['linear'],
        ['coalesce', ['feature-state', 'count'], 0],
        0, 'rgba(148,163,184,0.08)',
        1, 'rgba(45,212,191,0.35)',
        10, 'rgba(20,184,166,0.55)',
        50, 'rgba(13,148,136,0.7)',
        200, 'rgba(15,118,110,0.85)',
      ],
      'fill-outline-color': 'rgba(100,116,139,0.6)',
    },
  }
}

export function stateLineLayer(): LineLayerSpecification {
  return {
    id: 'state-line',
    type: 'line',
    source: SRC_STATES,
    paint: {
      'line-color': ['case', ['boolean', ['feature-state', 'hover'], false], '#0f766e', 'rgba(100,116,139,0.5)'],
      'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 2.5, 0.8],
    },
  }
}

export function stateLabelLayer(): SymbolLayerSpecification {
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
    paint: { 'text-color': '#0f172a', 'text-halo-color': 'rgba(255,255,255,0.9)', 'text-halo-width': 1.2 },
  }
}

/** Transit-path layers for the detail map. */
export function pathLineLayer(): LineLayerSpecification {
  return {
    id: 'path-line',
    type: 'line',
    source: 'path',
    filter: ['==', ['geometry-type'], 'LineString'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#0f766e', 'line-width': 3, 'line-opacity': 0.85, 'line-dasharray': [1, 0] },
  }
}

export function pathFutureLineLayer(): LineLayerSpecification {
  return {
    id: 'path-future',
    type: 'line',
    source: 'path',
    filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'future'], true]],
    layout: { 'line-cap': 'round' },
    paint: { 'line-color': '#94a3b8', 'line-width': 2.5, 'line-dasharray': [1.5, 2] },
  }
}

export function pathPointLayer(): CircleLayerSpecification {
  return {
    id: 'path-points',
    type: 'circle',
    source: 'path',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-radius': ['match', ['get', 'kind'], 'origin', 8, 'destination', 9, 6],
      'circle-color': ['match', ['get', 'kind'], 'origin', '#64748b', 'destination', statusColorExpression(), '#0f766e'],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
    },
  }
}

export function pathLabelLayer(): SymbolLayerSpecification {
  return {
    id: 'path-labels',
    type: 'symbol',
    source: 'path',
    filter: ['==', ['geometry-type'], 'Point'],
    layout: {
      'text-field': ['get', 'label'],
      'text-size': 11,
      'text-font': ['Noto Sans Regular'],
      'text-offset': [0, 1.2],
      'text-anchor': 'top',
      'text-optional': true,
    },
    paint: { 'text-color': '#0f172a', 'text-halo-color': 'rgba(255,255,255,0.9)', 'text-halo-width': 1.2 },
  }
}
