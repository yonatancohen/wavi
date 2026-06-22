<template>
  <section class="rounded-xl border border-outline-variant bg-surface-container p-4">
    <div class="mb-4 flex items-center gap-2">
      <span class="material-symbols-outlined text-[18px] text-secondary">groups</span>
      <h2 class="font-sora text-[15px] font-semibold text-on-surface">{{ t('members.title') }}</h2>
    </div>

    <LoadingState v-if="loading" variant="compact" :message="t('loading.members')" />

    <div v-else-if="error" class="rounded-xl border border-error/25 bg-error/[0.07] px-4 py-3 text-[13px] text-error">
      {{ error }}
    </div>

    <div v-else-if="members.length === 0" class="rounded-xl border border-dashed border-outline-variant bg-surface-variant/20 px-6 py-8 text-center">
      <span class="material-symbols-outlined mb-2 text-[28px] text-on-surface-variant/40">person_off</span>
      <p class="text-[13px] text-on-surface-variant">
        {{ t('members.empty') }}
      </p>
    </div>

    <div v-else class="grid gap-3">
      <article v-for="member in members" :key="member.id" class="rounded-xl border border-outline-variant bg-surface-variant/20 p-4">
        <!-- Display name -->
        <div class="mb-4">
          <div v-if="editingNameId === member.id" class="flex flex-wrap items-center gap-2">
            <input
              v-model="nameDraft[member.id]"
              type="text"
              class="min-w-[12rem] flex-1 rounded-lg border border-primary/40 bg-surface px-2.5 py-1.5 text-[14px] font-semibold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
              @keydown.enter="saveDisplayName(member)"
              @keydown.escape="cancelEditName(member.id)"
            />
            <button type="button" class="btn btn-primary px-2.5 py-1 text-[11px]" :disabled="savingId === member.id" @click="saveDisplayName(member)">
              {{ t('members.save') }}
            </button>
            <button type="button" class="btn btn-secondary px-2.5 py-1 text-[11px]" @click="cancelEditName(member.id)">
              {{ t('members.cancel') }}
            </button>
          </div>
          <div v-else class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex min-w-0 flex-wrap items-center gap-2">
              <h3 class="font-sora text-[15px] font-semibold text-on-surface">
                {{ member.display_name }}
              </h3>
              <HelpTooltip :title="activityLevelTooltipTitle(member.profile_data.activity_level)" :body="activityLevelTooltipBody(member.profile_data.activity_level)">
                <span class="badge shrink-0 px-2 py-0.5" :class="activityBadgeClass(member.profile_data.activity_level)">
                  {{ activityLevelLabel(member.profile_data.activity_level) }}
                </span>
              </HelpTooltip>
            </div>
            <button type="button" class="btn btn-primary inline-flex shrink-0 items-center gap-1.5 !min-h-0 px-3 py-1.5 text-[12px]" @click="startEditName(member)">
              <span class="material-symbols-outlined text-[16px]">edit</span>
              {{ t('members.editName') }}
            </button>
          </div>
          <p class="mt-1 font-mono text-[10px] text-on-surface-variant/50">
            {{ member.wa_user_id }}
            ·
            {{ t('members.messages', { count: member.msg_count.toLocaleString() }) }}
          </p>
        </div>

        <!-- Names Wavi recognizes -->
        <div class="mb-4 rounded-lg border border-outline-variant/60 bg-surface/40 p-3">
          <p class="mb-0.5 text-[11px] font-semibold text-on-surface">
            {{ t('members.recognizedNames') }}
          </p>
          <p class="mb-2 text-[11px] leading-relaxed text-on-surface-variant/80">
            {{ t('members.recognizedNamesHint') }}
          </p>

          <div v-if="memberAliases(member).length" class="mb-2 flex flex-wrap gap-1.5">
            <span
              v-for="alias in memberAliases(member)"
              :key="alias"
              class="inline-flex items-center gap-1 rounded-full border border-secondary/20 bg-secondary/10 px-2.5 py-0.5 text-[11px] text-secondary"
            >
              {{ alias }}
              <button type="button" class="opacity-50 transition-opacity hover:opacity-100" :title="t('members.removeAlias')" @click="removeAlias(member, alias)">×</button>
            </span>
          </div>
          <p v-else class="mb-2 text-[11px] italic text-on-surface-variant/50">
            {{ t('members.noAliasesYet') }}
          </p>

          <div>
            <div class="flex items-center gap-2">
              <input
                v-model="aliasDraft[member.id]"
                type="text"
                class="min-w-0 flex-1 rounded-lg border border-outline-variant bg-surface px-2.5 py-1.5 text-[12px] text-on-surface"
                :placeholder="t('members.addAliasPlaceholder')"
                @keydown.enter="addAliases(member)"
              />
              <button type="button" class="btn btn-secondary shrink-0 px-3 py-1.5 text-[11px]" :disabled="!aliasDraft[member.id]?.trim()" @click="addAliases(member)">
                {{ t('members.addNames') }}
              </button>
            </div>
            <p class="mt-1 text-[10px] text-on-surface-variant/60">
              {{ t('members.addAliasBulkHint') }}
            </p>
            <p v-if="aliasErrors[member.id]" class="mt-1 text-[10px] text-error">
              {{ aliasErrors[member.id] }}
            </p>
          </div>
        </div>

        <div class="mb-3">
          <div class="mb-2 flex items-center justify-between gap-2">
            <span class="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant/70">
              {{ t('members.profileAnalysis') }}
            </span>
            <button v-if="editingSummaryId !== member.id" type="button" class="btn btn-primary inline-flex items-center gap-1.5 !min-h-0 px-3 py-1.5 text-[12px]" @click="startEditSummary(member)">
              <span class="material-symbols-outlined text-[16px]">edit</span>
              {{ t('members.editSummary') }}
            </button>
          </div>
          <div v-if="editingSummaryId === member.id" class="flex flex-col gap-2">
            <textarea
              v-model="summaryDraft[member.id]"
              rows="3"
              class="w-full resize-y rounded-lg border border-primary/40 bg-surface px-2.5 py-1.5 text-[13px] leading-relaxed text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
              @keydown.escape="cancelEditSummary(member.id)"
            />
            <div class="flex flex-wrap items-center gap-2">
              <button type="button" class="btn btn-primary px-2.5 py-1 text-[11px]" :disabled="savingId === member.id" @click="saveSummary(member)">
                {{ t('members.save') }}
              </button>
              <button type="button" class="btn btn-secondary px-2.5 py-1 text-[11px]" @click="cancelEditSummary(member.id)">
                {{ t('members.cancel') }}
              </button>
            </div>
          </div>
          <p v-else class="text-[13px] leading-relaxed text-on-surface-variant">
            {{ member.behavioral_summary || t('members.noSummaryYet') }}
          </p>
        </div>

        <div class="mb-3 flex flex-wrap gap-2">
          <span class="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">
            {{ formatHumorType(member.profile_data.humor_type) }}
          </span>
          <span class="rounded-full bg-secondary/10 px-2.5 py-1 text-[10px] font-semibold text-secondary"> {{ member.profile_data.emoji_usage }} emoji </span>
          <span
            v-for="topic in member.profile_data.dominant_topics.slice(0, 2)"
            :key="topic"
            class="rounded-full border border-outline-variant px-2.5 py-1 text-[10px] font-medium text-on-surface-variant"
          >
            {{ topic }}
          </span>
        </div>

        <div v-if="member.profile_data.sensitivity_flags.length > 0" class="mb-3 flex flex-wrap gap-1.5">
          <span v-for="flag in member.profile_data.sensitivity_flags" :key="flag" class="rounded-md bg-error/[0.06] px-2 py-0.5 text-[10px] text-on-surface-variant/60">
            {{ flag }}
          </span>
        </div>

        <!-- Merge duplicates (advanced) -->
        <details class="border-t border-outline-variant/50 pt-3">
          <summary class="cursor-pointer text-[11px] font-medium text-on-surface-variant/70 hover:text-on-surface-variant">
            {{ t('members.advancedMerge') }}
          </summary>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <select v-model="mergeTarget[member.id]" class="rounded-lg border border-outline-variant bg-surface px-2 py-1.5 text-[11px] text-on-surface-variant">
              <option value="">{{ t('members.mergeWith') }}</option>
              <option v-for="other in members.filter((m) => m.id !== member.id)" :key="other.id" :value="other.id">
                {{ other.display_name }}
              </option>
            </select>
            <button type="button" class="btn btn-secondary px-2.5 py-1 text-[11px]" :disabled="!mergeTarget[member.id] || savingId === member.id" @click="mergeMember(member)">
              {{ t('members.merge') }}
            </button>
          </div>
        </details>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiFetch } from '../lib/api';
import LoadingState from './LoadingState.vue';
import HelpTooltip from './HelpTooltip.vue';
import type { UserProfile } from '@wavi/shared';

const { t } = useI18n();

const props = defineProps<{ groupId: string }>();

const members = ref<UserProfile[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const savingId = ref<string | null>(null);
const editingNameId = ref<string | null>(null);
const editingSummaryId = ref<string | null>(null);
const aliasDraft = reactive<Record<string, string>>({});
const aliasErrors = reactive<Record<string, string>>({});
const nameDraft = reactive<Record<string, string>>({});
const summaryDraft = reactive<Record<string, string>>({});
const mergeTarget = reactive<Record<string, string>>({});

function memberAliases(member: UserProfile): string[] {
  return member.profile_data?.aliases ?? [];
}

function parseAliasInput(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function applyAliasesLocally(memberId: string, newAliases: string[]) {
  members.value = members.value.map((m) => {
    if (m.id !== memberId) return m;
    const existing = memberAliases(m);
    const merged = [...existing];
    for (const alias of newAliases) {
      const norm = alias.toLowerCase();
      if (!merged.some((a) => a.toLowerCase() === norm)) merged.push(alias);
    }
    return {
      ...m,
      profile_data: { ...m.profile_data, aliases: merged },
    };
  });
}

function restoreAliases(memberId: string, aliases: string[]) {
  members.value = members.value.map((m) => {
    if (m.id !== memberId) return m;
    return {
      ...m,
      profile_data: { ...m.profile_data, aliases },
    };
  });
}

function activityBadgeClass(level: UserProfile['profile_data']['activity_level']) {
  const map = {
    high: 'bg-primary/10 text-primary border border-primary/20',
    medium: 'bg-secondary/10 text-secondary border border-secondary/20',
    low: 'bg-surface-variant text-on-surface-variant border border-outline-variant',
    lurker: 'bg-surface-variant/50 text-on-surface-variant/60 border border-outline-variant/50',
  };
  return map[level];
}

type ActivityLevel = UserProfile['profile_data']['activity_level'];

function activityLevelLabel(level: ActivityLevel) {
  return t(`members.activityLevel.${level}`);
}

function activityLevelTooltipTitle(level: ActivityLevel) {
  return `${t('members.activityLevelTitle')} · ${activityLevelLabel(level)}`;
}

function activityLevelTooltipBody(level: ActivityLevel) {
  return `${t('members.activityLevelTooltip')} ${t(`members.activityLevelDesc.${level}`)}`;
}

function formatHumorType(type: string) {
  return type.replace(/-/g, ' ');
}

function startEditName(member: UserProfile) {
  editingNameId.value = member.id;
  nameDraft[member.id] = member.display_name;
}

function cancelEditName(memberId: string) {
  editingNameId.value = null;
  delete nameDraft[memberId];
}

function startEditSummary(member: UserProfile) {
  editingSummaryId.value = member.id;
  summaryDraft[member.id] = member.behavioral_summary ?? '';
}

function cancelEditSummary(memberId: string) {
  editingSummaryId.value = null;
  delete summaryDraft[memberId];
}

async function patchMember(memberId: string, body: Record<string, unknown>): Promise<UserProfile> {
  return apiFetch<UserProfile>(`/groups/${props.groupId}/members/${memberId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

async function saveDisplayName(member: UserProfile) {
  const name = nameDraft[member.id]?.trim();
  if (!name || name === member.display_name) {
    cancelEditName(member.id);
    return;
  }
  savingId.value = member.id;
  error.value = null;
  try {
    const updated = await patchMember(member.id, { display_name: name });
    members.value = members.value.map((m) => (m.id === member.id ? updated : m));
    cancelEditName(member.id);
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('members.failedSave');
  } finally {
    savingId.value = null;
  }
}

async function saveSummary(member: UserProfile) {
  const summary = summaryDraft[member.id]?.trim() ?? '';
  if (summary === (member.behavioral_summary ?? '')) {
    cancelEditSummary(member.id);
    return;
  }
  savingId.value = member.id;
  error.value = null;
  try {
    const updated = await patchMember(member.id, { behavioral_summary: summary });
    members.value = members.value.map((m) => (m.id === member.id ? updated : m));
    cancelEditSummary(member.id);
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('members.failedSave');
  } finally {
    savingId.value = null;
  }
}

async function addAliases(member: UserProfile) {
  const raw = aliasDraft[member.id]?.trim();
  if (!raw) return;

  const pending = parseAliasInput(raw);
  if (!pending.length) return;

  const previous = [...memberAliases(member)];
  applyAliasesLocally(member.id, pending);
  aliasDraft[member.id] = '';
  delete aliasErrors[member.id];

  try {
    const updated = await patchMember(member.id, { add_aliases: [raw] });
    members.value = members.value.map((m) => (m.id === member.id ? updated : m));
  } catch (e) {
    restoreAliases(member.id, previous);
    aliasErrors[member.id] = e instanceof Error ? e.message : t('members.failedSave');
  }
}

async function removeAlias(member: UserProfile, alias: string) {
  savingId.value = member.id;
  error.value = null;
  try {
    const updated = await patchMember(member.id, { remove_alias: alias });
    members.value = members.value.map((m) => (m.id === member.id ? updated : m));
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('members.failedSave');
  } finally {
    savingId.value = null;
  }
}

async function mergeMember(member: UserProfile) {
  const targetId = mergeTarget[member.id];
  if (!targetId) return;
  savingId.value = member.id;
  error.value = null;
  try {
    await apiFetch<UserProfile>(`/groups/${props.groupId}/members/merge`, {
      method: 'POST',
      body: JSON.stringify({ keep_profile_id: targetId, merge_profile_id: member.id }),
    });
    mergeTarget[member.id] = '';
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('members.failedSave');
  } finally {
    savingId.value = null;
  }
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    members.value = await apiFetch<UserProfile[]>(`/groups/${props.groupId}/members`);
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('members.failedLoad');
    members.value = [];
  } finally {
    loading.value = false;
  }
}

watch(() => props.groupId, load);
onMounted(load);

defineExpose({ reload: load });
</script>
