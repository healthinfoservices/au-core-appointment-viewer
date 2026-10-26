import { ref, watch } from 'vue'

const STORAGE_KEY = 'appointmentViewer.fhirBaseUrl'

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

// Saved browser value wins over the build-time .env default.
const baseUrl = ref(readStored() || import.meta.env.VITE_FHIR_BASE_URL || '')

watch(baseUrl, (v) => {
  try {
    if (v) localStorage.setItem(STORAGE_KEY, v)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* storage unavailable: keep the value in memory only */
  }
})

export function useSettings() {
  return { baseUrl }
}
