<script setup>
import { computed, ref } from 'vue'
import InfoList from './InfoList.vue'
import PatientCard from './PatientCard.vue'
import PractitionerCard from './PractitionerCard.vue'
import {
  formatDateTime,
  formatTime,
  durationMinutes,
  conceptText,
  conceptsText,
  statusColor,
  titleCase,
} from '../utils/fhirFormat.js'

const props = defineProps({ vm: { type: Object, required: true } })
const emit = defineEmits(['close'])

const a = computed(() => props.vm.appointment)
const showJson = ref(false)

const when = computed(() => {
  const start = formatDateTime(a.value.start)
  if (!start) return 'No start time recorded'
  const end = a.value.end ? formatTime(a.value.end) : ''
  return end ? `${start} – ${end}` : start
})

const detailRows = computed(() => {
  const x = a.value
  const mins = durationMinutes(x)
  return [
    { label: 'Duration', value: mins != null ? `${mins} minutes` : '' },
    { label: 'Appointment type', value: conceptText(x.appointmentType) },
    { label: 'Service category', value: conceptsText(x.serviceCategory) },
    { label: 'Service type', value: conceptsText(x.serviceType) },
    { label: 'Specialty', value: conceptsText(x.specialty) },
    {
      label: 'Reason',
      value: [
        conceptsText(x.reasonCode),
        ...(x.reasonReference || []).map((r) => r.display || r.reference),
      ]
        .filter(Boolean)
        .join(', '),
    },
    { label: 'Description', value: x.description },
    { label: 'Priority', value: x.priority },
    { label: 'Cancellation reason', value: conceptText(x.cancelationReason) },
    { label: 'Comment', value: x.comment },
    { label: 'Patient instruction', value: x.patientInstruction },
    { label: 'Created', value: formatDateTime(x.created) },
    { label: 'Last updated', value: formatDateTime(x.meta?.lastUpdated) },
    { label: 'Resource', value: `Appointment/${x.id}` },
  ]
})

const otherRows = computed(() =>
  props.vm.others.map((o) => ({
    label: o.type,
    value: [o.display || o.reference, o.participantStatus && `(${titleCase(o.participantStatus)})`]
      .filter(Boolean)
      .join(' '),
  })),
)

const json = computed(() => JSON.stringify(a.value, null, 2))
</script>

<template>
  <v-card>
    <v-toolbar color="primary" density="comfortable">
      <v-toolbar-title>Appointment</v-toolbar-title>
      <v-spacer />
      <v-btn icon="mdi-close" aria-label="Close" @click="emit('close')" />
    </v-toolbar>

    <v-card-text class="pt-5">
      <div class="d-flex flex-wrap align-center ga-3 mb-5">
        <v-chip :color="statusColor(vm.status)" label>{{ titleCase(vm.status) }}</v-chip>
        <div class="text-h6">{{ when }}</div>
      </div>

      <v-row>
        <v-col cols="12" md="6">
          <v-card variant="outlined" class="h-100">
            <v-card-item prepend-icon="mdi-calendar-clock">
              <v-card-title>Appointment details</v-card-title>
            </v-card-item>
            <v-card-text>
              <InfoList :rows="detailRows" />
              <template v-if="otherRows.length">
                <v-divider class="my-3" />
                <div class="text-overline">Other participants</div>
                <InfoList :rows="otherRows" />
              </template>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col v-for="p in vm.patients" :key="p.reference" cols="12" md="6">
          <PatientCard :participant="p" />
        </v-col>

        <v-col v-for="p in vm.practitioners" :key="p.reference" cols="12" md="6">
          <PractitionerCard :participant="p" />
        </v-col>

        <v-col v-if="!vm.patients.length" cols="12" md="6">
          <v-alert type="info" variant="tonal">This appointment has no Patient participant.</v-alert>
        </v-col>
        <v-col v-if="!vm.practitioners.length" cols="12" md="6">
          <v-alert type="info" variant="tonal">
            This appointment has no Practitioner or PractitionerRole participant.
          </v-alert>
        </v-col>
      </v-row>

      <v-btn
        class="mt-4"
        variant="text"
        :prepend-icon="showJson ? 'mdi-chevron-up' : 'mdi-code-json'"
        @click="showJson = !showJson"
      >
        {{ showJson ? 'Hide' : 'Show' }} Appointment JSON
      </v-btn>
      <v-expand-transition>
        <pre v-if="showJson" class="json">{{ json }}</pre>
      </v-expand-transition>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.json {
  background: rgba(var(--v-theme-on-surface), 0.05);
  padding: 12px;
  border-radius: 8px;
  overflow: auto;
  max-height: 400px;
  font-size: 0.8rem;
}
</style>
