<script setup>
import { computed, onMounted, ref } from 'vue'
import { useDisplay } from 'vuetify'
import SearchPanel from './components/SearchPanel.vue'
import AppointmentTable from './components/AppointmentTable.vue'
import AppointmentDetail from './components/AppointmentDetail.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import { useSettings } from './composables/useSettings.js'
import {
  FhirClient,
  searchByDate,
  searchByPatientName,
  searchByPractitionerName,
} from './services/appointmentSearch.js'

const { baseUrl } = useSettings()
const { smAndDown } = useDisplay()

const searchPanel = ref(null)
const settingsOpen = ref(false)
const loading = ref(false)
const error = ref('')
const results = ref(null) // { appointments, truncated, failures, note }
const lastQuery = ref(null)
const selected = ref(null)

const detailOpen = computed({
  get: () => !!selected.value,
  set: (v) => {
    if (!v) selected.value = null
  },
})

const serverHost = computed(() => {
  try {
    return new URL(baseUrl.value).host
  } catch {
    return 'Not set'
  }
})

const summary = computed(() => {
  if (!results.value || !lastQuery.value) return ''
  const n = results.value.appointments.length
  const q = lastQuery.value
  const what =
    q.mode === 'date'
      ? `on ${new Date(`${q.value}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`
      : `for ${q.mode} "${q.value.trim()}"`
  return `${n} appointment${n === 1 ? '' : 's'} ${what}`
})

let requestSeq = 0

async function runSearch(query) {
  if (!baseUrl.value) {
    settingsOpen.value = true
    return
  }
  const seq = ++requestSeq
  loading.value = true
  error.value = ''
  try {
    const client = new FhirClient(baseUrl.value)
    const fn =
      query.mode === 'patient'
        ? searchByPatientName
        : query.mode === 'practitioner'
          ? searchByPractitionerName
          : searchByDate
    const r = await fn(client, query.value)
    if (seq !== requestSeq) return // a newer search finished first
    results.value = r
    lastQuery.value = query
  } catch (e) {
    if (seq !== requestSeq) return
    error.value = e.message
    results.value = null
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

function saveSettings(url) {
  baseUrl.value = url
  results.value = null
  searchPanel.value?.searchToday()
}

onMounted(() => {
  if (baseUrl.value) searchPanel.value?.searchToday()
  else settingsOpen.value = true
})
</script>

<template>
  <v-app>
    <v-app-bar color="primary" flat>
      <v-app-bar-title>
        <v-icon icon="mdi-calendar-account" class="mr-2" />Appointment Viewer
      </v-app-bar-title>
      <v-chip variant="outlined" size="small" class="mr-2 d-none d-sm-flex" prepend-icon="mdi-server">
        {{ serverHost }}
      </v-chip>
      <v-btn icon="mdi-cog" aria-label="FHIR server settings" @click="settingsOpen = true" />
    </v-app-bar>

    <v-main class="bg-grey-lighten-4">
      <v-container class="py-6" style="max-width: 1280px">
        <SearchPanel ref="searchPanel" :loading="loading" class="mb-4" @search="runSearch" />

        <v-alert v-if="!baseUrl" type="info" variant="tonal" class="mb-4">
          Set the FHIR server URL to start searching.
          <template #append>
            <v-btn variant="text" @click="settingsOpen = true">Open settings</v-btn>
          </template>
        </v-alert>

        <v-alert v-if="error" type="error" variant="tonal" closable class="mb-4" @click:close="error = ''">
          {{ error }}
        </v-alert>

        <template v-if="results">
          <div class="d-flex flex-wrap align-center ga-2 mb-3">
            <div class="text-subtitle-1 font-weight-medium">{{ summary }}</div>
            <v-chip v-if="results.note" size="small" variant="tonal">{{ results.note }}</v-chip>
          </div>
          <v-alert v-if="results.truncated" type="warning" variant="tonal" density="compact" class="mb-3">
            The server returned more pages than this viewer loads, so some results are not shown.
            Try a more specific search.
          </v-alert>
          <v-alert v-if="results.failures.length" type="warning" variant="tonal" density="compact" class="mb-3">
            {{ results.failures.length }} referenced resource{{ results.failures.length === 1 ? '' : 's' }}
            could not be loaded ({{ results.failures.map((f) => f.reference).join(', ') }}).
          </v-alert>
        </template>

        <AppointmentTable
          :items="results?.appointments || []"
          :loading="loading"
          @select="selected = $event"
        />
      </v-container>
    </v-main>

    <v-dialog v-model="detailOpen" :fullscreen="smAndDown" max-width="1100" scrollable>
      <AppointmentDetail v-if="selected" :vm="selected" @close="selected = null" />
    </v-dialog>

    <SettingsDialog v-model="settingsOpen" :base-url="baseUrl" @save="saveSettings" />
  </v-app>
</template>
