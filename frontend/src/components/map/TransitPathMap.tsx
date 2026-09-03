import { useEffect, useRef, useState } from 'react'
import Map, { Layer, NavigationControl, Source, type MapRef } from 'react-map-gl/maplibre'
import type { FeatureCollection, LineString, Point } from 'geojson'
import { pathFutureLineLayer, pathLabelLayer, pathLineLayer, pathPointLayer } from '@/lib/mapLayers'

export type PathCollection = FeatureCollection<Point | LineString, Record<string, unknown>>

export function TransitPathMap({ styleUrl, path, height = 260 }: { styleUrl: string; path?: PathCollection; height?: number }) {
  const ref = useRef<MapRef>(null)
  const [style, setStyle] = useState(styleUrl)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => setStyle(styleUrl), [styleUrl])

  useEffect(() => {
    const map = ref.current?.getMap()
    if (!map || !loaded || !path || path.features.length === 0) return
    let minX = 180, minY = 90, maxX = -180, maxY = -90
    const eat = (c: number[]) => {
      if (c[0] < minX) minX = c[0]
      if (c[0] > maxX) maxX = c[0]
      if (c[1] < minY) minY = c[1]
      if (c[1] > maxY) maxY = c[1]
    }
    for (const f of path.features) {
      if (f.geometry.type === 'Point') eat(f.geometry.coordinates)
      else for (const c of f.geometry.coordinates) eat(c)
    }
    if (minX > maxX) return
    if (minX === maxX && minY === maxY) {
      map.jumpTo({ center: [minX, minY], zoom: 9 })
    } else {
      map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 40, duration: 0, maxZoom: 10 })
    }
  }, [path, loaded])

  const empty = !path || path.features.length === 0
  return (
    <div className="relative overflow-hidden rounded-lg border border-border" style={{ height }}>
      <Map
        ref={ref}
        mapStyle={style}
        initialViewState={{ longitude: -96, latitude: 38, zoom: 3 }}
        style={{ width: '100%', height: '100%' }}
        onLoad={() => setLoaded(true)}
        onError={() => style !== '/geo/blank-style.json' && setStyle('/geo/blank-style.json')}
        attributionControl={{ compact: true }}
        interactive
      >
        <NavigationControl position="top-right" showCompass={false} />
        {path && (
          <Source id="path" type="geojson" data={path}>
            <Layer {...pathLineLayer()} filter={['all', ['==', ['geometry-type'], 'LineString'], ['!=', ['get', 'future'], true]]} />
            <Layer {...pathFutureLineLayer()} />
            <Layer {...pathPointLayer()} />
            <Layer {...pathLabelLayer()} />
          </Source>
        )}
      </Map>
      {empty && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted">
          <span className="rounded bg-panel/90 px-2 py-1">No location data yet</span>
        </div>
      )}
    </div>
  )
}
