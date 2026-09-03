import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
