import axios from 'axios'
import { getAccessToken } from './auth'
import { runtimeApiUrl } from './desktop'

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// In packaged builds the backend port is chosen at app launch, so the URL baked
// into NEXT_PUBLIC_API_URL is wrong. The Electron preload exposes the actual
// URL via window.phoenix.apiUrl — prefer that, fall back to env in dev/web.
export const apiClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use((config) => {
  const runtime = runtimeApiUrl()
  if (runtime) config.baseURL = runtime
  return config
})

// Attach the current Supabase access token on every request.
apiClient.interceptors.request.use(async (config) => {
  const token = await getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (typeof window !== 'undefined' && err.response?.status === 401) {
      const path = window.location.pathname
      if (path !== '/login') window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// Human-readable (Thai-friendly) message out of an axios/network error —
// for surfacing failures to the user instead of swallowing them.
export function apiErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail
    if (typeof detail === 'string' && detail) return detail
    if (err.response) return `เซิร์ฟเวอร์ตอบกลับผิดพลาด (HTTP ${err.response.status})`
    return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสอบว่าแอปยังทำงานอยู่'
  }
  return err instanceof Error ? err.message : 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ'
}

// Speech-to-text (offline faster-whisper on the backend)
export const sttApi = {
  transcribe: (blob: Blob, lang = 'th', model = '', filename = 'audio.webm') => {
    const fd = new FormData()
    fd.append('file', blob, filename)
    fd.append('lang', lang)
    if (model) fd.append('model', model)
    return apiClient.post<{ text: string; model?: string }>('/stt', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}

// Projects
export const projectsApi = {
  list: () => apiClient.get('/projects'),
  create: (data: { name: string; description?: string }) =>
    apiClient.post('/projects', data),
  get: (id: string) => apiClient.get(`/projects/${id}`),
  update: (id: string, data: { name?: string; description?: string }) =>
    apiClient.patch(`/projects/${id}`, data),
  delete: (id: string) => apiClient.delete(`/projects/${id}`),
}

// Flows
export const flowsApi = {
  list: (projectId: string) => apiClient.get(`/projects/${projectId}/flows`),
  create: (projectId: string, data: { name: string; description?: string }) =>
    apiClient.post(`/projects/${projectId}/flows`, data),
  get: (id: string) => apiClient.get(`/flows/${id}`),
  update: (id: string, data: object) => apiClient.patch(`/flows/${id}`, data),
  execute: (id: string, inputData?: object) =>
    apiClient.post(`/flows/${id}/execute`, { input_data: inputData || {} }),
  // (continuous preview now streams over /ws/preview — see autoRunStore)
}

// Public Google Sheets — backend proxy that returns the CSV text
export const sheetsApi = {
  fetchCsv: (url: string) => apiClient.post<{ text: string; url: string }>('/sheets/csv', { url }),
}

// Models (externally-trained .pt / .onnx files for Deep* blocks)
export const modelsApi = {
  upload: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return apiClient.post('/models/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}

// TrainAI — build & train your own models
export const trainApi = {
  list: (task?: string) =>
    apiClient.get('/train/projects', { params: task ? { task } : {} }),
  create: (data: { name: string; task: string }) =>
    apiClient.post('/train/projects', data),
  get: (id: string) => apiClient.get(`/train/projects/${id}`),
  delete: (id: string) => apiClient.delete(`/train/projects/${id}`),
  addClass: (id: string, name: string) =>
    apiClient.post(`/train/projects/${id}/classes`, { name }),
  deleteClass: (id: string, name: string) =>
    apiClient.delete(`/train/projects/${id}/classes/${encodeURIComponent(name)}`),
  addImages: (id: string, class_name: string, images: string[]) =>
    apiClient.post(`/train/projects/${id}/images`, { class_name, images }),
  importZip: (id: string, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return apiClient.post(`/train/projects/${id}/import-zip`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  train: (
    id: string,
    epochs?: number,
    targetAcc?: number,
    augment?: Record<string, boolean | number | string> | null,
    modelSize?: string,
  ) =>
    apiClient.post(`/train/projects/${id}/train`, {
      epochs,
      target_acc: targetAcc ?? null,
      augment: augment ?? null,
      model_size: modelSize ?? null,
    }),
  photo: (id: string, cls: string, fname: string) =>
    apiClient.get(`/train/projects/${id}/photo/${encodeURIComponent(cls)}/${encodeURIComponent(fname)}`, { responseType: 'blob' }),
  setBaseModel: (id: string, v: { model_id: string; model_name: string } | null) =>
    apiClient.post(`/train/projects/${id}/base-model`, {
      model_id: v?.model_id ?? null,
      model_name: v?.model_name ?? null,
    }),
  stop: (id: string) => apiClient.post(`/train/projects/${id}/stop`),
  status: (id: string) => apiClient.get(`/train/projects/${id}/status`),
  download: (id: string) =>
    apiClient.get(`/train/projects/${id}/download`, { responseType: 'blob' }),
  downloadDataset: (id: string) =>
    apiClient.get(`/train/projects/${id}/download-dataset`, { responseType: 'blob' }),
  predict: (id: string, image: string) =>
    apiClient.post(`/train/projects/${id}/predict`, { image }),
  augmentDataset: (id: string, augment: Record<string, boolean | number | string>) =>
    apiClient.post(`/train/projects/${id}/augment-dataset`, { augment }, { responseType: 'blob' }),
}

// TrainAI Detection (bounding-box labelling + training)
interface DetBox { cls: number; cx: number; cy: number; w: number; h: number }
export const trainDetApi = {
  get: (id: string) => apiClient.get(`/train/det/${id}`),
  setClasses: (id: string, classes: string[]) =>
    apiClient.post(`/train/det/${id}/classes`, { classes }),
  addImages: (id: string, images: string[]) =>
    apiClient.post(`/train/det/${id}/images`, { images }),
  image: (id: string, imgId: string) =>
    apiClient.get(`/train/det/${id}/image/${imgId}`, { responseType: 'blob' }),
  deleteImage: (id: string, imgId: string) =>
    apiClient.delete(`/train/det/${id}/image/${imgId}`),
  annotations: (id: string, imgId: string, boxes: DetBox[]) =>
    apiClient.post(`/train/det/${id}/annotations`, { img_id: imgId, boxes }),
  autolabel: (id: string, imgId: string) =>
    apiClient.post(`/train/det/${id}/autolabel`, { img_id: imgId }),
  autolabelAll: (id: string, mapping: Record<string, number>, overwrite = false) =>
    apiClient.post(`/train/det/${id}/autolabel-all`, { mapping, overwrite }),
  train: (id: string, epochs?: number, targetAcc?: number, augment?: Record<string, boolean | number | string> | null, modelSize?: string) =>
    apiClient.post(`/train/det/${id}/train`, { epochs, target_acc: targetAcc ?? null, augment: augment ?? null, model_size: modelSize ?? null }),
  augmentDataset: (id: string, augment: Record<string, boolean | number | string>) =>
    apiClient.post(`/train/det/${id}/augment-dataset`, { augment }, { responseType: 'blob' }),
  predict: (id: string, image: string) =>
    apiClient.post(`/train/det/${id}/predict`, { image }),
}

// Backend-native processing — upload a source video the backend decodes itself
export const nativeApi = {
  uploadVideo: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return apiClient.post('/native/video', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  deleteVideo: (fileId: string) => apiClient.delete(`/native/video/${fileId}`),
}
