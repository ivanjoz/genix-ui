<script module lang="ts">
	let lockedModalCount = 0;
	let documentOverflowBeforeModal = "";
	let documentScrollbarGutterBeforeModal = "";

	// Count open modal instances so stacked dialogs do not restore page scrolling too early.
	function lockDocumentScroll() {
		if (lockedModalCount === 0) {
			const documentRoot = document.documentElement;
			documentOverflowBeforeModal = documentRoot.style.overflow;
			documentScrollbarGutterBeforeModal = documentRoot.style.scrollbarGutter;
			const scrollbarWidth = window.innerWidth - documentRoot.clientWidth;
			// Only reserve space that existed before opening; short pages have no gutter to keep.
			if (scrollbarWidth > 0) documentRoot.style.scrollbarGutter = "stable";
			documentRoot.style.overflow = "hidden";
			console.debug("[modal] document scroll locked", {
				scrollbarWidth,
			});
		}
		lockedModalCount += 1;
	}

	function unlockDocumentScroll() {
		lockedModalCount = Math.max(0, lockedModalCount - 1);
		if (lockedModalCount === 0) {
			const documentRoot = document.documentElement;
			documentRoot.style.overflow = documentOverflowBeforeModal;
			documentRoot.style.scrollbarGutter = documentScrollbarGutterBeforeModal;
			console.debug("[modal] document scroll restored");
		}
	}
</script>

<script lang="ts">
  import { useUI } from '../runtime/index.js';
  const ui = useUI();
	import { untrack } from "svelte";
	import { onDestroy } from "svelte";
	import Portal from "../misc/Portal.svelte";
	import OptionsStrip from "../navigation/OptionsStrip.svelte";
	import FileUploadSelector from "../files/FileUploadSelector.svelte";
	import { Agent } from "../agent/registry";

	interface Props {
		children?: import("svelte").Snippet;
		id: number;
		title: string | import("svelte").Snippet;
		css?: string;
		isEdit?: boolean;
		onSave?: () => void;
		onDelete?: () => void;
		onClose?: () => void;
		bodyCss?: string;
		headCss?: string;
		// Drops the title bar so the dialog can draw its own header edge to edge. The action
		// buttons stay exactly where the bar put them, and the body reclaims the 50px the bar
		// used to reserve.
		hideTitle?: boolean;
		size: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
		saveIcon?: string;
		saveButtonLabel?: string;
		useFileImportWithErrors?: boolean;
		onFileChange?: (file?: File, isRemoved?: boolean) => void;
		fileErrors?: string[];
	}

	let {
		children,
		id,
		title,
		css = "",
		headCss,
		bodyCss,
		hideTitle = false,
		isEdit = false,
		onSave,
		onDelete,
		onClose,
		size,
		saveIcon,
		saveButtonLabel,
		useFileImportWithErrors = false,
		onFileChange,
		fileErrors = [],
	}: Props = $props();

	// Local state for this modal instance
	let isOpen = $state(false);
	let modalDiv: HTMLDivElement | undefined = $state();
	let dialogDiv: HTMLDivElement | undefined = $state();
	let selectedImportFile = $state<File | undefined>(undefined);
	let selectedImportView = $state(1);
	let focusBeforeOpen: HTMLElement | null = null;
	let hasLockedDocumentScroll = false;
	const importViewOptions = [[1, "Records|Registros"], [2, "Errors|Errores"]] as [number, string][];
	const focusableSelector = [
		'a[href]',
		'button:not([disabled])',
		'input:not([disabled])',
		'select:not([disabled])',
		'textarea:not([disabled])',
		'[tabindex]:not([tabindex="-1"])',
	].join(',');

	const getFocusableElements = () => {
		if (!dialogDiv) return [];
		return [...dialogDiv.querySelectorAll<HTMLElement>(focusableSelector)]
			.filter((element) => !element.hasAttribute('hidden') && element.getClientRects().length > 0);
	};

	const focusDialogContent = () => {
		if (!dialogDiv) return;
		// Two queries, not one comma-separated selector: querySelector returns the first match in
		// *document order*, so a marker bundled with the control selectors never actually wins —
		// an earlier input takes the focus and the marker does nothing. A dialog whose first
		// unlocked field is a DateInput needs the override, because DateInput opens its calendar
		// on focus and covers the rest of the form. Set it with Input's `focusOnOpen`.
		const explicitTarget = dialogDiv.querySelector<HTMLElement>('[data-autofocus]');
		// Otherwise prefer a form control, so data-entry dialogs are ready immediately.
		const firstControl = dialogDiv.querySelector<HTMLElement>(
			'input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
		);
		(explicitTarget || firstControl || getFocusableElements()[0] || dialogDiv).focus();
	};

	const releaseDialogFocus = () => {
		if (focusBeforeOpen?.isConnected) focusBeforeOpen.focus();
		focusBeforeOpen = null;
	};

	const closeDialog = () => {
		if (onClose) onClose();
		ui.closeModal(id);
	};

	// Mirror this modal's local transition state from the shared runtime collection.
	$effect(() => {
		const isThisModalOpen = ui.state.openModalIds.includes(id);
		if (isOpen === isThisModalOpen) {
			return;
		}

		if (isThisModalOpen) {
			focusBeforeOpen = document.activeElement instanceof HTMLElement ? document.activeElement : null;
			if (!hasLockedDocumentScroll) {
				lockDocumentScroll();
				hasLockedDocumentScroll = true;
			}
			isOpen = true;
			if (useFileImportWithErrors) {
				selectedImportView = 1;
				selectedImportFile = undefined;
			}
			// Use untrack to avoid creating dependencies on modalDiv
			untrack(() => {
				setTimeout(() => {
					if (modalDiv) {
						modalDiv.classList.add("modal-show");
					}
					focusDialogContent();
				}, 0);
			});
		} else {
			if (hasLockedDocumentScroll) {
				unlockDocumentScroll();
				hasLockedDocumentScroll = false;
			}
			releaseDialogFocus();
			untrack(() => {
				modalDiv?.classList?.remove("modal-show");
				setTimeout(() => {
					isOpen = false;
				}, 300);
			});
		}
	});

	function handleClose(ev: MouseEvent) {
		ev.stopPropagation();
		closeDialog();
	}

	function handleModalKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			closeDialog();
			return;
		}
		if (event.key !== 'Tab') return;

		const focusableElements = getFocusableElements();
		if (focusableElements.length === 0) {
			event.preventDefault();
			dialogDiv?.focus();
			return;
		}

		const firstElement = focusableElements[0];
		const lastElement = focusableElements[focusableElements.length - 1];
		if (event.shiftKey && document.activeElement === firstElement) {
			event.preventDefault();
			lastElement.focus();
		} else if (!event.shiftKey && document.activeElement === lastElement) {
			event.preventDefault();
			firstElement.focus();
		}
	}

	function handleDelete(ev: MouseEvent) {
		if (onDelete) {
			onDelete();
			ev.stopPropagation();
		}
	}

	function handleSave(ev: MouseEvent) {
		if (onSave) {
			onSave();
			ev.stopPropagation();
		}
	}

	// Helper to check if title is a snippet
	function isSnippet(value: any): value is import("svelte").Snippet {
		return typeof value === "function";
	}

	const modalSizesMap = new Map([
		[1, "w-650 max-w-[66vw]"],
		[2, "w-700 max-w-[68vw]"],
		[3, "w-750 max-w-[72vw]"],
		[4, "w-800 max-w-[75vw]"],
		[5, "w-850 max-w-[78vw]"],
		[6, "w-900 max-w-[82vw]"],
		[7, "w-950 max-w-[84vw]"],
		[8, "w-1000 max-w-[88vw]"],
		[9, "w-1080 max-w-[89vw]"],
	]);

	const saveLabel = $derived.by(() => {
		if (saveButtonLabel) {
			return saveButtonLabel;
		}
		return isEdit ? "Update|Actualizar" : "Save|Guardar";
	});

	const handleImportFileChange = (file?: File, isRemoved?: boolean) => {
		console.log("[modal] import file changed:", {
			id,
			fileName: file?.name || null,
			isRemoved: !!isRemoved,
		});
		selectedImportFile = file;
		onFileChange?.(file, isRemoved);
	};

	const closeErrorsView = (event: MouseEvent) => {
		event.stopPropagation();
		selectedImportView = 1;
	};

	$effect(() => {
		if (!useFileImportWithErrors) {
			return;
		}

		if ((fileErrors || []).length > 0) {
			selectedImportView = 2;
		}
	});

	onDestroy(() => {
		if (hasLockedDocumentScroll) unlockDocumentScroll();
		releaseDialogFocus();
	});

	const componentID = ui.nextComponentId();
	const titleLabel = $derived.by(() => (typeof title === "string" ? title : ""));

	$effect(() => {
		return Agent.register({
			id: componentID,
			type: "Modal",
			label: titleLabel,
			close: () => {
				closeDialog();
			},
		});
	});
</script>

{#snippet modalTitleContent()}
	{#if isSnippet(title)}
		{@render title()}
	{:else}
		{ui.translate(title)}
	{/if}
{/snippet}

{#snippet modalActions()}
	{#if onDelete}
		<button
			class="bx-red mr-10 lh-10"
			onclick={handleDelete}
			aria-label={ui.translate("Delete|Eliminar")}
		>
			<i class="icon-[fa--trash]"></i>
		</button>
	{/if}
	{#if onSave}
		<button
			class="bx-blue mr-10 lh-10"
			onclick={handleSave}
			aria-label={ui.translate(saveLabel)}
		>
			<i class={saveIcon || "icon-[fa--floppy-o]"}></i>
			<span class="_5">{ui.translate(saveLabel)}</span>
		</button>
	{/if}
	<button
		class="bx-yellow h3 lh-10 -mr-2"
		onclick={handleClose}
		aria-label={ui.translate("Close|Cerrar")}
	>
		<i class="icon-[fa--close]"></i>
	</button>
{/snippet}

{#if isOpen}
	<Portal>
		<div data-id="Modal:{componentID}"
			class="_1 fixed top-0 left-0 flex items-center justify-center"
			bind:this={modalDiv}
		>
			<div
				class="_2 min-h-460 flex flex-col relative {hideTitle
					? 'overflow-hidden'
					: 'pt-50'} {css} {modalSizesMap.get(size)}"
				bind:this={dialogDiv}
				role="dialog"
				aria-modal="true"
				aria-labelledby="modal-title-{componentID}"
				tabindex="-1"
				onkeydown={handleModalKeydown}
			>
				{#if hideTitle}
					<!-- The bar is gone but the dialog still needs a name, so the title is kept for
					     assistive tech only. The actions keep the header's own box (h-50 + the same
					     horizontal padding) so they land pixel-identical to the titled layout. -->
					<span id="modal-title-{componentID}" class="sr-only">
						{@render modalTitleContent()}
					</span>
					<div class="h-50 px-8 md:px-12 flex absolute top-0 right-0 z-10 items-center {headCss}">
						{@render modalActions()}
					</div>
				{:else}
					<div
						class="_3 h-50 py-0 px-8 md:px-12 flex absolute w-full top-0 left-0 items-center justify-between mb-auto {headCss}"
					>
						<div
							id="modal-title-{componentID}"
							class="flex items-center ff-bold leading-[1.1] text-lg md:text-xl"
						>
							{@render modalTitleContent()}
						</div>
						<div class="flex items-center">
							{@render modalActions()}
						</div>
					</div>
				{/if}
				<div class="w-full grow py-6 px-2 relative md:px-10 {bodyCss}">
					{#if useFileImportWithErrors}
						<div
							class="w-full flex flex-col md:flex-row md:items-center md:justify-between gap-8 mb-8"
						>
							<div class="shrink-0 md:min-w-240 relative">
								<OptionsStrip
									options={importViewOptions}
									selected={selectedImportView}
									onSelect={(option) => {
										selectedImportView = option[0];
									}}
								/>
							</div>
							<div class="grow min-w-0 md:flex md:justify-end md:items-center">
								<FileUploadSelector
									bind:selectedFile={selectedImportFile}
									onChange={handleImportFileChange}
									extensions={["xlsx", "xlx"]}
								/>
							</div>
						</div>

						{#if selectedImportView === 1}
							{@render children?.()}
						{:else}
							<div class="p-8 relative rounded-md border border-red-200">
								<button
									class="bx-red absolute right-6 top-6 lh-10"
									onclick={closeErrorsView}
									aria-label={ui.translate("Close errors|Cerrar errores")}
								>
									<i class="icon-[fa--close]"></i>
								</button>
								<div class="ff-bold text-red-700 mb-2">
									{ui.translate("Import validations|Validaciones de importación")}
								</div>
								{#if fileErrors.length > 0}
									<div class="text-red-700 text-sm max-h-200 overflow-y-auto">
										{#each fileErrors as fileError}
											<div>{fileError}</div>
										{/each}
									</div>
								{:else}
									<div class="text-red-700 text-sm">
										{ui.translate("No errors to display.|No hay errores para mostrar.")}
									</div>
								{/if}
							</div>
						{/if}
					{:else}
						{@render children?.()}
					{/if}
				</div>
			</div>
		</div>
	</Portal>
{/if}

<style>
	._1 {
		/* background */
		width: 100vw;
		height: 100vh;
		position: fixed;
		background-color: rgba(0, 0, 0, 0.5);
		z-index: var(--modal-zindex);
		opacity: 0;
		transition: opacity 0.3s ease;
	}

	._1.modal-show {
		opacity: 1;
	}

	._2 {
		/* body */
		background-color: var(--white-6);
		transform: translateY(-80px);
		background-color: white;
		opacity: 0;
		transition:
			transform 0.3s ease,
			opacity 0.3s ease;
		border-radius: 0.5rem;
		box-shadow:
			0 11px 15px -7px rgba(0, 0, 0, 0.2),
			0px 24px 38px 3px rgba(0, 0, 0, 0.14),
			0px 9px 46px 8px rgba(0, 0, 0, 0.12);
	}

	._1.modal-show > ._2 {
		transform: translateY(0px);
		opacity: 1;
	}

	._3 {
		/* Title */
		background-color: #f2f2f2;
		border-bottom: 1px solid #0000001a;
		border-radius: 7px 7px 0 0;
	}

	/* Mobile responsive */
	@media (max-width: 640px) {
		._2 {
			max-width: calc(100vw - 16px);
			width: calc(100vw - 16px);
			padding-left: 8px;
			padding-right: 8px;
		}

		._5 {
			display: none;
		}

		:global(.modal-title .name) {
			padding-left: 0;
			padding-top: 2px;
			font-size: 1.1rem;
			overflow: hidden;
		}
	}

	@media (max-width: 420px) {
		._2 {
			max-width: calc(100vw - 8px);
			width: calc(100vw - 8px);
			padding-left: 4px;
			padding-right: 4px;
		}
	}
</style>
