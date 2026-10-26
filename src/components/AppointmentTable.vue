<script setup>
import { formatDateTime, durationMinutes, statusColor, titleCase } from '../utils/fhirFormat.js'
import { patientNames, practitionerNames, appointmentTypeLabel } from '../utils/viewModel.js'

defineProps({
  items: { type: Array, required: true },
  loading: { type: Boolean, default: false },
})
const emit = defineEmits(['select'])

const headers = [
  { title: 'Date & time', key: 'start', value: (i) => i.start || '' },
  { title: 'Status', key: 'status' },
  { title: 'Patient', key: 'patient', value: (i) => patientNames(i) },
  { title: 'Practitioner', key: 'practitioner', value: (i) => practitionerNames(i) },
  { title: 'Type / service', key: 'type', value: (i) => appointmentTypeLabel(i) },
  { title: 'Description', key: 'description', value: (i) => i.appointment.description || '' },
]

function onRowClick(_event, row) {
  emit('select', row.item)
}
</script>

<template>
  <v-card>
    <v-data-table
      :headers="headers"
      :items="items"
      item-value="key"
      :loading="loading"
      :items-per-page="25"
      :sort-by="[{ key: 'start', order: 'asc' }]"
      hover
      class="appointment-table"
      no-data-text="No appointments to show"
      @click:row="onRowClick"
    >
      <template #[`item.start`]="{ item }">
        <div class="font-weight-medium">{{ formatDateTime(item.start) || '—' }}</div>
        <div v-if="durationMinutes(item.appointment) != null" class="text-caption text-medium-emphasis">
          {{ durationMinutes(item.appointment) }} min
        </div>
      </template>
      <template #[`item.status`]="{ item }">
        <v-chip :color="statusColor(item.status)" size="small" label>{{ titleCase(item.status) }}</v-chip>
      </template>
    </v-data-table>
  </v-card>
</template>

<style scoped>
.appointment-table :deep(tbody tr) {
  cursor: pointer;
}
</style>
