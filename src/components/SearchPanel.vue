<script setup>
import { ref } from 'vue'
import { localToday } from '../services/appointmentSearch.js'

defineProps({ loading: { type: Boolean, default: false } })
const emit = defineEmits(['search'])

const mode = ref('date')
const patientName = ref('')
const practitionerName = ref('')
const date = ref(localToday())

function submit() {
  const value =
    mode.value === 'patient'
      ? patientName.value
      : mode.value === 'practitioner'
        ? practitionerName.value
        : date.value
  emit('search', { mode: mode.value, value })
}

function searchToday() {
  date.value = localToday()
  mode.value = 'date'
  submit()
}

defineExpose({ searchToday })
</script>

<template>
  <v-card>
    <v-tabs v-model="mode" color="primary" grow>
      <v-tab value="date" prepend-icon="mdi-calendar">By date</v-tab>
      <v-tab value="patient" prepend-icon="mdi-account">By patient</v-tab>
      <v-tab value="practitioner" prepend-icon="mdi-stethoscope">By practitioner</v-tab>
    </v-tabs>
    <v-divider />
    <v-card-text>
      <v-form @submit.prevent="submit">
        <div class="d-flex flex-wrap ga-3 align-start">
          <template v-if="mode === 'date'">
            <v-text-field
              v-model="date"
              type="date"
              label="Appointment date"
              hint="Appointments starting on this day (your local time)"
              persistent-hint
              class="search-field"
            />
            <v-btn variant="tonal" size="large" prepend-icon="mdi-calendar-today" :disabled="loading" @click="searchToday">
              Today
            </v-btn>
          </template>

          <v-text-field
            v-else-if="mode === 'patient'"
            v-model="patientName"
            label="Patient name"
            placeholder="e.g. Citizen or Jane"
            hint="Matches the start of any part of the name"
            persistent-hint
            prepend-inner-icon="mdi-account-search"
            clearable
            autofocus
            class="search-field"
          />

          <v-text-field
            v-else
            v-model="practitionerName"
            label="Practitioner name"
            placeholder="e.g. Nguyen"
            hint="Includes appointments booked against the practitioner's roles"
            persistent-hint
            prepend-inner-icon="mdi-account-search"
            clearable
            autofocus
            class="search-field"
          />

          <v-btn type="submit" color="primary" size="large" prepend-icon="mdi-magnify" :loading="loading">
            Search
          </v-btn>
        </div>
      </v-form>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.search-field {
  flex: 1 1 260px;
  min-width: 220px;
}
</style>
