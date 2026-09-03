import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Feature, FeatureCollection, Point } from 'geojson'
import { api, unwrap } from './client'
import type { components } from './schema'
import { filtersToQuery, type Filters } from '@/lib/filters'

export type ShipmentRow = components['schemas']['ShipmentRow']
export type Stats = components['schemas']['Stats']
export type Facets = components['schemas']['Facets']
export type UploadOut = components['schemas']['UploadOut']
export type UploadPreview = components['schemas']['UploadPreview']
export type CommitRequest = components['schemas']['CommitRequest']
export type CommitResult = components['schemas']['CommitResult']
export type PresetOut = components['schemas']['PresetOut']

type Query = Record<string, string | number | boolean | string[] | number[]>

export function useShipments(f: Filters) {
  const query = filtersToQuery(f) as Query
  return useQuery({
    queryKey: ['shipments', query],
    queryFn: async () => unwrap(await api.GET('/api/shipments', { params: { query } })),
    placeholderData: keepPreviousData,
  })
}

export function useStats(f: Partial<Filters>) {
  const query = filtersToQuery(f) as Query
  return useQuery({
    queryKey: ['stats', query],
    queryFn: async () => unwrap(await api.GET('/api/shipments/stats', { params: { query } })),
    placeholderData: keepPreviousData,
  })
}

export function useFacets() {
  return useQuery({
    queryKey: ['facets'],
    queryFn: async () => unwrap(await api.GET('/api/shipments/facets')),
    staleTime: 60_000,
  })
}

export function useUploads() {
  return useQuery({
    queryKey: ['uploads'],
    queryFn: async () => unwrap(await api.GET('/api/uploads')),
  })
}

export function usePresets() {
  return useQuery({
    queryKey: ['presets'],
    queryFn: async () => unwrap(await api.GET('/api/presets')),
  })
}

export function useInvalidateAll() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['shipments'] })
    qc.invalidateQueries({ queryKey: ['stats'] })
    qc.invalidateQueries({ queryKey: ['facets'] })
    qc.invalidateQueries({ queryKey: ['uploads'] })
    qc.invalidateQueries({ queryKey: ['map'] })
    qc.invalidateQueries({ queryKey: ['shipment'] })
    qc.invalidateQueries({ queryKey: ['attention'] })
  }
}

export function useUploadFile() {
  return useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/uploads', { method: 'POST', body: fd })
      if (!res.ok) {
        let msg = res.statusText
        try {
          const j = await res.json()
          msg = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
        } catch {
          /* ignore */
        }
        throw new Error(msg)
      }
      return (await res.json()) as UploadPreview
    },
  })
}

export function usePreview() {
  return useMutation({
    mutationFn: async (args: { upload_id: number; sheet?: string; header_row?: number }) =>
      unwrap(
        await api.GET('/api/uploads/{upload_id}/preview', {
          params: { path: { upload_id: args.upload_id }, query: { sheet: args.sheet, header_row: args.header_row } },
        }),
      ),
  })
}

export function useCommitUpload() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: async (args: { upload_id: number; body: CommitRequest }) =>
      unwrap(await api.POST('/api/uploads/{upload_id}/commit', { params: { path: { upload_id: args.upload_id } }, body: args.body })),
    onSuccess: invalidate,
  })
}

export function useDeleteUpload() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: async (upload_id: number) => unwrap(await api.DELETE('/api/uploads/{upload_id}', { params: { path: { upload_id } } })),
    onSuccess: invalidate,
  })
}

export type AppConfig = { app_name: string; map_style_url: string; map_style_url_dark: string; carrier_mode: string; auth_enabled: boolean; stuck_days: number }

export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: async () => unwrap(await api.GET('/api/config')) as AppConfig,
    staleTime: Infinity,
  })
}

export type PointFeature = Feature<Point, { id: number; s: string; c: string; p: string; n: string | null; pl: string; t: string; w: number }>
export type PointCollection = FeatureCollection<Point, PointFeature['properties']>
export type StateCounts = Record<string, { total: number; by_status: Record<string, number> }>

export function useMapPoints(f: Partial<Filters>) {
  const query = filtersToQuery(f) as Query
  return useQuery({
    queryKey: ['map', 'points', query],
    queryFn: async () => unwrap(await api.GET('/api/map/points.geojson', { params: { query } })) as PointCollection,
    placeholderData: keepPreviousData,
  })
}

export function useMapStates(f: Partial<Filters>) {
  const query = filtersToQuery(f) as Query
  return useQuery({
    queryKey: ['map', 'states', query],
    queryFn: async () => unwrap(await api.GET('/api/map/states', { params: { query } })) as StateCounts,
    placeholderData: keepPreviousData,
  })
}

// ---------------------------------------------------------------- shipment detail / refresh / jobs
export type ShipmentDetail = components['schemas']['ShipmentDetail']
export type JobOut = components['schemas']['JobOut']
export type ShipmentPatch = components['schemas']['ShipmentPatch']
export type PathCollection = import('geojson').FeatureCollection<import('geojson').Point | import('geojson').LineString, Record<string, unknown>>

export function useShipment(id: number | null) {
  return useQuery({
    queryKey: ['shipment', id],
    queryFn: async () => unwrap(await api.GET('/api/shipments/{shipment_id}', { params: { path: { shipment_id: id! } } })),
    enabled: id != null,
  })
}

export function useShipmentPath(id: number | null) {
  return useQuery({
    queryKey: ['shipment', id, 'path'],
    queryFn: async () => unwrap(await api.GET('/api/shipments/{shipment_id}/path.geojson', { params: { path: { shipment_id: id! } } })) as PathCollection,
    enabled: id != null,
  })
}

export function useRefreshShipment() {
  const qc = useQueryClient()
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: async (id: number) => unwrap(await api.POST('/api/shipments/{shipment_id}/refresh', { params: { path: { shipment_id: id } } })),
    onSuccess: (data, id) => {
      qc.setQueryData(['shipment', id], data)
      qc.invalidateQueries({ queryKey: ['shipment', id, 'path'] })
      invalidate()
    },
  })
}

export function usePatchShipment() {
  const qc = useQueryClient()
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: async (args: { id: number; body: ShipmentPatch }) =>
      unwrap(await api.PATCH('/api/shipments/{shipment_id}', { params: { path: { shipment_id: args.id } }, body: args.body })),
    onSuccess: (data, args) => {
      qc.setQueryData(['shipment', args.id], data)
      invalidate()
    },
  })
}

export function useDeleteShipment() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: async (id: number) => unwrap(await api.DELETE('/api/shipments/{shipment_id}', { params: { path: { shipment_id: id } } })),
    onSuccess: invalidate,
  })
}

export function useStartRefresh() {
  return useMutation({
    mutationFn: async (body: components['schemas']['RefreshRequest']) => unwrap(await api.POST('/api/refresh', { body })),
  })
}

export function useJob(id: number | null) {
  return useQuery({
    queryKey: ['job', id],
    queryFn: async () => unwrap(await api.GET('/api/jobs/{job_id}', { params: { path: { job_id: id! } } })),
    enabled: id != null,
    refetchInterval: (q) => {
      const s = q.state.data?.status
      return s === 'queued' || s === 'running' ? 700 : false
    },
  })
}

export function useCurrentJob() {
  return useQuery({
    queryKey: ['job', 'current'],
    queryFn: async () => unwrap(await api.GET('/api/jobs/current')),
    refetchInterval: (q) => (q.state.data ? 1000 : 10_000),
  })
}

// ---------------------------------------------------------------- settings / privacy
export type CarrierSettings = components['schemas']['CarrierSettingsOut']
export type GeocoderSettings = components['schemas']['GeocoderSettingsOut']
export type GeneralSettings = components['schemas']['GeneralSettings']
export type PrivacySummary = components['schemas']['PrivacySummary']

export function useCarrierSettings() {
  return useQuery({ queryKey: ['settings', 'carriers'], queryFn: async () => unwrap(await api.GET('/api/settings/carriers')) })
}

export function useSaveCarrier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { carrier: 'usps' | 'fedex'; body: components['schemas']['CarrierSettingsIn'] }) =>
      unwrap(await api.PUT('/api/settings/carriers/{carrier}', { params: { path: { carrier: args.carrier } }, body: args.body })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      qc.invalidateQueries({ queryKey: ['config'] })
      qc.invalidateQueries({ queryKey: ['health'] })
    },
  })
}

export function useTestCarrier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (carrier: 'usps' | 'fedex') => unwrap(await api.POST('/api/settings/carriers/{carrier}/test', { params: { path: { carrier } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })
}

export function useGeocoderSettings() {
  return useQuery({ queryKey: ['settings', 'geocoder'], queryFn: async () => unwrap(await api.GET('/api/settings/geocoder')) })
}

export function useSaveGeocoder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: components['schemas']['GeocoderSettingsIn']) => unwrap(await api.PUT('/api/settings/geocoder', { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })
}

export function useTestGeocoder() {
  return useMutation({ mutationFn: async () => unwrap(await api.POST('/api/settings/geocoder/test')) })
}

export function useGeneralSettings() {
  return useQuery({ queryKey: ['settings', 'general'], queryFn: async () => unwrap(await api.GET('/api/settings')) })
}

export function useSaveGeneral() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: GeneralSettings) => unwrap(await api.PUT('/api/settings', { body })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      qc.invalidateQueries({ queryKey: ['config'] })
    },
  })
}

export function usePrivacySummary() {
  return useQuery({ queryKey: ['privacy'], queryFn: async () => unwrap(await api.GET('/api/privacy/summary')) })
}

export function useWipe() {
  const invalidate = useInvalidateAll()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { token: string; keep_settings: boolean }) => unwrap(await api.POST('/api/privacy/wipe', { body: args })),
    onSuccess: () => {
      invalidate()
      qc.invalidateQueries({ queryKey: ['privacy'] })
    },
  })
}

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: async () => unwrap(await api.GET('/api/health')) as { ok: boolean; carriers: Record<string, string>; refresh_running: boolean; carrier_mode: string; auth: boolean },
    staleTime: 30_000,
  })
}

// ---------------------------------------------------------------- attention / notes / tags
export type AttentionRow = components['schemas']['AttentionRow']

export function useAttention(f: Partial<Filters>) {
  const query = filtersToQuery(f) as Query
  return useQuery({
    queryKey: ['attention', query],
    queryFn: async () => unwrap(await api.GET('/api/attention', { params: { query } })),
    placeholderData: keepPreviousData,
  })
}

export function useAddNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { id: number; body: string }) =>
      unwrap(await api.POST('/api/shipments/{shipment_id}/notes', { params: { path: { shipment_id: args.id } }, body: { body: args.body } })),
    onSuccess: (data, args) => qc.setQueryData(['shipment', args.id], data),
  })
}

export function useDeleteNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { id: number; noteId: number }) => unwrap(await api.DELETE('/api/notes/{note_id}', { params: { path: { note_id: args.noteId } } })),
    onSuccess: (_d, args) => qc.invalidateQueries({ queryKey: ['shipment', args.id] }),
  })
}

export function useSetTags() {
  const qc = useQueryClient()
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: async (args: { id: number; tags: string[] }) =>
      unwrap(await api.PUT('/api/shipments/{shipment_id}/tags', { params: { path: { shipment_id: args.id } }, body: { tags: args.tags } })),
    onSuccess: (data, args) => {
      qc.setQueryData(['shipment', args.id], data)
      invalidate()
    },
  })
}

export function useTags() {
  return useQuery({ queryKey: ['tags'], queryFn: async () => unwrap(await api.GET('/api/tags')) })
}
