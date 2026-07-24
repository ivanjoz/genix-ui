<script lang="ts">
  import { useUI, type UiRecordReference } from '../runtime/index.js';
  import { untrack } from 'svelte';

  interface ITextRecord {
    ID: number;
    Usuario?: string;
    Name?: string;
    FirstName?: string;
    LastName?: string;
  }

  let {
    apiRoute,
    recordID,
    placeholder = '-',
  }: {
    apiRoute: string;
    recordID: number;
    placeholder?: string;
  } = $props();

  const ui = useUI();
  let recordReference = $state<UiRecordReference<ITextRecord> | null>(null);
  let lastResolvedRecordID = $state(0);

  const normalizedRecordID = $derived.by(() => Number(recordID || 0));
  const resolvedRecord = $derived(recordReference?.record || null);

  const resolvedText = $derived.by(() => {
    if (!resolvedRecord) { return placeholder; }

    // Prefer common display keys used across modules before fallback to placeholder.
    if (resolvedRecord.Usuario) { return resolvedRecord.Usuario; }
    if (resolvedRecord.Name) { return resolvedRecord.Name; }
    const fullName = [resolvedRecord.FirstName, resolvedRecord.LastName].filter(Boolean).join(' ').trim();
    if (fullName.length > 0) { return fullName; }
    return placeholder;
  });

  $effect(() => {
    const nextRecordID = normalizedRecordID;
    if (!(nextRecordID > 0)) {
      untrack(() => {
        recordReference = null;
        lastResolvedRecordID = 0;
      });
      return;
    }

    const hasSameTargetRecord = untrack(() => lastResolvedRecordID === nextRecordID);
    if (hasSameTargetRecord) {
      return;
    }

    untrack(() => {
      // Keep one cache ref per current ID to avoid unnecessary re-instantiations.
      lastResolvedRecordID = nextRecordID;
      recordReference = ui.resolveRecord<ITextRecord>(apiRoute, nextRecordID);
    });
  });
</script>

<span>{resolvedText}</span>
