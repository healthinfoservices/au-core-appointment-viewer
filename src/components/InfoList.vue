<script setup>
import { computed } from 'vue'

// rows: [{ label, value }]; rows with empty values are hidden.
const props = defineProps({ rows: { type: Array, required: true } })
const visible = computed(() =>
  props.rows.filter((r) => r.value !== '' && r.value !== null && r.value !== undefined),
)
</script>

<template>
  <dl class="info-list">
    <template v-for="r in visible" :key="r.label">
      <dt class="text-medium-emphasis">{{ r.label }}</dt>
      <dd>{{ r.value }}</dd>
    </template>
    <div v-if="!visible.length" class="text-medium-emphasis text-body-2">No details recorded</div>
  </dl>
</template>

<style scoped>
.info-list {
  display: grid;
  grid-template-columns: minmax(110px, max-content) 1fr;
  column-gap: 16px;
  row-gap: 6px;
  margin: 0;
  font-size: 0.9rem;
}
.info-list dd {
  margin: 0;
  overflow-wrap: anywhere;
}
@media (max-width: 480px) {
  .info-list {
    grid-template-columns: 1fr;
  }
  .info-list dd {
    margin-bottom: 6px;
  }
}
</style>
