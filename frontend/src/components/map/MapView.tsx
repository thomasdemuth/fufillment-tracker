import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Map, { Layer, NavigationControl, Popup, ScaleControl, Source, type MapLayerMouseEvent, type MapRef } from 'react-map-gl/maplibre'
import type { GeoJSONSource } from 'maplibre-gl'
import type { Point } from 'geojson'
import type { PointCollection, PointFeature, StateCounts } from '@/api/queries'
import {
  SRC_POINTS,
  SRC_RAW,
  SRC_STATES,
  clusterCountLayer,
  clusterLayer,
  clusterProperties,
  heatmapLayer,
  mapPalette,
  pointLayer,
  stateFillLayer,
  stateLabelLayer,
  stateLineLayer,
} from '@/lib/mapLayers'
import { StatusBadge } from '@/components/ui/status-badge'
import { useIsDark, type MapMode } from '@/stores/uiStore'
import { BasemapBanner, useBasemap } from '@/components/map/useBasemap'
import { assetUrl } from '@/lib/server'

const US_BOUNDS: [[number, number], [number, number]] = [[-125, 24], [-66, 50]]
const EMPTY: PointCollection = { type: 'FeatureCollection', features: [] }

export interface MapViewProps {
  styleUrl: string
  mode: MapMode
  points?: PointCollection
  states?: StateCounts
  onSelect: (id: number) => void
  onStateClick?: (postal: string) => void
  selectedId?: number | null
  fitOnData?: boolean
  controlsPosition?: 'top-right' | 'bottom-right'
}

export function MapView({ styleUrl, mode, points, states, onSelect, onStateClick, selectedId, fitOnData = true, controlsPosition = 'top-right' }: MapViewProps) {
  const mapRef = useRef<MapRef>(null)
  const dark = useIsDark()
  const p = useMemo(() => mapPalette(dark), [dark])
  const basemap = useBasemap(styleUrl)
  const [loaded, setLoaded] = useState(false)
  const [hover, setHover] = useState<{ lng: number; lat: number; props: Record<string, unknown> } | null>(null)
  const [hoverState, setHoverState] = useState<string | null>(null)
  const fittedRef = useRef(false)
  const cluster = useMemo(() => clusterProperties(), [])
  const data = points ?? EMPTY

  // Fit to data on first load
  useEffect(() => {
    if (!fitOnData || !loaded || fittedRef.current || !points || points.features.length === 0) return
    const map = mapRef.current?.getMap()
    if (!map) return
    let minX = 180, minY = 90, maxX = -180, maxY = -90
    for (const f of points.features) {
      const [x, y] = f.geometry.coordinates
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 60, duration: 600, maxZoom: 9 })
    fittedRef.current = true
  }, [points, loaded, fitOnData])

  // Push state counts into feature-state
  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map || !loaded || !states) return
    const apply = () => {
      const src = map.getSource(SRC_STATES)
      if (!src) return
      const feats = map.querySourceFeatures(SRC_STATES)
      const seen = new Set<string>()
      for (const f of feats) {
        const postal = String(f.properties?.postal ?? f.id)
        if (seen.has(postal)) continue
        seen.add(postal)
        map.setFeatureState({ source: SRC_STATES, id: postal }, { count: states[postal]?.total ?? 0 })
      }
    }
    apply()
    map.on('sourcedata', apply)
    return () => {
      map.off('sourcedata', apply)
    }
  }, [states, loaded, mode])

  const onClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const map = mapRef.current?.getMap()
      if (!map) return
      const f = e.features?.[0]
      if (!f) return
      if (f.layer.id === 'clusters') {
        const src = map.getSource(SRC_POINTS) as GeoJSONSource
        const clusterId = f.properties?.cluster_id as number
        src.getClusterExpansionZoom(clusterId).then((zoom) => {
          map.easeTo({ center: (f.geometry as Point).coordinates as [number, number], zoom: Math.min(zoom + 0.5, 16) })
        })
        return
      }
      if (f.layer.id === 'points') {
        onSelect(Number(f.properties?.id))
        return
      }
      if (f.layer.id === 'state-fill' && onStateClick) {
        onStateClick(String(f.properties?.postal))
      }
    },
    [onSelect, onStateClick],
  )

  const onMouseMove = useCallback((e: MapLayerMouseEvent) => {
    const map = mapRef.current?.getMap()
    if (!map) return
    const f = e.features?.[0]
    map.getCanvas().style.cursor = f ? 'pointer' : ''
    if (f?.layer.id === 'points') {
      setHover({ lng: e.lngLat.lng, lat: e.lngLat.lat, props: f.properties ?? {} })
    } else {
      setHover(null)
    }
    if (f?.layer.id === 'state-fill') {
      const postal = String(f.properties?.postal)
      setHoverState((prev) => {
        if (prev && prev !== postal) map.setFeatureState({ source: SRC_STATES, id: prev }, { hover: false })
        map.setFeatureState({ source: SRC_STATES, id: postal }, { hover: true })
        return postal
      })
    } else if (hoverState) {
      map.setFeatureState({ source: SRC_STATES, id: hoverState }, { hover: false })
      setHoverState(null)
    }
  }, [hoverState])

  const interactive = mode === 'states' ? ['state-fill'] : mode === 'points' ? ['clusters', 'points'] : ['points']

  return (
    <>
    <BasemapBanner state={basemap} />
    <Map
      ref={mapRef}
      mapStyle={basemap.style}
      initialViewState={{ bounds: US_BOUNDS, fitBoundsOptions: { padding: 40 } }}
      style={{ width: '100%', height: '100%' }}
      interactiveLayerIds={interactive}
      onClick={onClick}
      onMouseMove={onMouseMove}
      onMouseLeave={() => setHover(null)}
      onLoad={() => setLoaded(true)}
      onError={(e) => basemap.onError(String((e as { error?: { message?: string } }).error?.message ?? ''))}
      attributionControl={{ compact: true }}
      reuseMaps
    >
      <NavigationControl position={controlsPosition} showCompass={false} />
      <ScaleControl position="bottom-left" unit="imperial" />

      <Source id={SRC_STATES} type="geojson" data={assetUrl('/geo/us-states.geojson')} promoteId="postal">
        <Layer {...stateFillLayer(p)} layout={{ visibility: mode === 'states' ? 'visible' : 'none' }} />
        <Layer {...stateLineLayer(p)} layout={{ visibility: mode === 'states' ? 'visible' : 'none' }} />
        <Layer {...stateLabelLayer(p)} layout={{ ...stateLabelLayer(p).layout, visibility: mode === 'states' ? 'visible' : 'none' }} />
      </Source>

      <Source id={SRC_RAW} type="geojson" data={data}>
        <Layer {...heatmapLayer(p)} layout={{ visibility: mode === 'heatmap' ? 'visible' : 'none' }} />
      </Source>

      <Source id={SRC_POINTS} type="geojson" data={data} cluster={mode === 'points'} clusterRadius={45} clusterMaxZoom={13} clusterProperties={cluster}>
        <Layer {...clusterLayer(p)} layout={{ visibility: mode === 'points' ? 'visible' : 'none' }} />
        <Layer {...clusterCountLayer(p)} layout={{ ...clusterCountLayer(p).layout, visibility: mode === 'points' ? 'visible' : 'none' }} />
        <Layer
          {...pointLayer(p)}
          layout={{ visibility: mode === 'states' ? 'none' : 'visible' }}
          paint={{ ...pointLayer(p).paint, 'circle-opacity': mode === 'heatmap' ? 0.35 : 0.95 }}
        />
      </Source>

      {selectedId != null && (
        <Source id="selected" type="geojson" data={{ type: 'FeatureCollection', features: data.features.filter((f: PointFeature) => f.properties.id === selectedId) }}>
          <Layer id="selected-ring" type="circle" paint={{ 'circle-radius': 12, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': p.accent, 'circle-stroke-width': 3 }} />
        </Source>
      )}

      {hover && (
        <Popup longitude={hover.lng} latitude={hover.lat} closeButton={false} closeOnClick={false} offset={10} anchor="bottom">
          <div className="text-[12px]">
            <div className="font-semibold text-text">{String(hover.props.n ?? 'Unknown recipient')}</div>
            <div className="text-muted">{String(hover.props.pl ?? '')}</div>
            <div className="mt-1.5 flex items-center gap-2">
              <StatusBadge status={String(hover.props.s)} />
              <span className="font-mono text-[10px] text-muted">{String(hover.props.t)}</span>
            </div>
          </div>
        </Popup>
      )}
    </Map>
    </>
  )
}
