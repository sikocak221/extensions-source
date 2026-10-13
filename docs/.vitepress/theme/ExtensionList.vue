<script setup lang="ts">
import { computed, ref } from 'vue';
import { withBase } from 'vitepress';
// Written by scripts/build-site.mjs from the index it just built.
import extensions from '../data/extensions.json';

interface Entry {
  id: string;
  name: string;
  version: string;
  langs: string[];
  nsfw: boolean;
  icon: string | null;
}

const all = extensions as Entry[];
const query = ref('');
const lang = ref('');
const hideNsfw = ref(false);

const languages = [...new Set(all.flatMap((e) => e.langs))].sort();
const shown = computed(() => {
  const q = query.value.trim().toLowerCase();
  return all.filter(
    (e) =>
      (!q || e.name.toLowerCase().includes(q) || e.id.includes(q)) &&
      (!lang.value || e.langs.includes(lang.value)) &&
      !(hideNsfw.value && e.nsfw),
  );
});
</script>

<template>
  <div class="ext-list">
    <div class="ext-controls">
      <input v-model="query" type="search" placeholder="Search extensions" aria-label="Search extensions" />
      <select v-model="lang" aria-label="Language">
        <option value="">All languages</option>
        <option v-for="l in languages" :key="l" :value="l">{{ l.toUpperCase() }}</option>
      </select>
      <label><input v-model="hideNsfw" type="checkbox" /> Hide 18+</label>
    </div>
    <p class="ext-count">{{ shown.length }} of {{ all.length }} extensions</p>
    <ul class="ext-grid">
      <li v-for="e in shown" :key="e.id" class="ext-card">
        <img v-if="e.icon" :src="withBase('/' + e.icon)" alt="" width="40" height="40" loading="lazy" />
        <span v-else class="ext-noicon" aria-hidden="true" />
        <div class="ext-body">
          <strong class="ext-name">{{ e.name }}</strong>
          <span class="ext-meta">
            v{{ e.version }} · {{ e.langs.map((l) => l.toUpperCase()).join(', ') }}
            <span v-if="e.nsfw" class="ext-badge">18+</span>
          </span>
        </div>
      </li>
    </ul>
    <p v-if="!shown.length" class="ext-count">No extension matches.</p>
  </div>
</template>

<style scoped>
.ext-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin: 16px 0 8px;
}
.ext-controls input[type='search'] {
  flex: 1 1 220px;
}
.ext-controls input[type='search'],
.ext-controls select {
  padding: 8px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  font-size: 14px;
}
.ext-controls label {
  font-size: 14px;
  display: flex;
  gap: 6px;
  align-items: center;
}
.ext-count {
  color: var(--vp-c-text-2);
  font-size: 14px;
}
.ext-grid {
  list-style: none;
  padding: 0;
  margin: 12px 0 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}
.ext-card {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px;
  margin: 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
}
.ext-card img,
.ext-noicon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  flex: none;
  object-fit: cover;
  background: var(--vp-c-default-soft);
}
.ext-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.ext-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ext-meta {
  color: var(--vp-c-text-2);
  font-size: 13px;
}
.ext-badge {
  margin-left: 4px;
  padding: 0 6px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--vp-c-danger-1);
  background: var(--vp-c-danger-soft);
}
</style>
