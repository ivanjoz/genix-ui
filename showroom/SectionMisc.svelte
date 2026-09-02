<script lang="ts">
  import Button from '../buttons/Button.svelte';
  import FileUploadSelector from '../files/FileUploadSelector.svelte';
  import HighlightText from '../misc/HighlightText.svelte';
  import Info from '../misc/Info.svelte';
  import LoadingBar from '../misc/LoadingBar.svelte';
  import Portal from '../misc/Portal.svelte';
  import Renderer, { type ElementAST } from '../misc/Renderer.svelte';
  import T from '../misc/T.svelte';
  import VirtualCards from '../misc/VirtualCards.svelte';
  import Virtualizer from '../misc/Virtualizer.svelte';
  import ShowroomBlock from './ShowroomBlock.svelte';
  import { buildShowroomUsers } from './showroom-data';

  const listItems = buildShowroomUsers(1000);
  const cardItems = buildShowroomUsers(120);

  let selectedFile = $state<File | undefined>(undefined);
  let isPortalVisible = $state(false);
  let lastRendererClick = $state('—');
  // HTMLEditor pulls in RoosterJS, the heaviest import on the page, so it loads on demand.
  let isEditorLoaded = $state(false);
  let editorForm = $state({ Html: '<p>Editable <b>rich text</b>.</p>' });

  const rendererTree: ElementAST[] = [
    { tagName: 'DIV', css: 'text-sm text-gray-700', text: 'Rendered from an ElementAST tree:' },
    {
      tagName: 'DIV', css: 'flex gap-8 mt-6', children: [
        { tagName: 'SPAN', css: 'px-8 py-2 bg-blue-100 text-blue-700 rounded text-xs', text: 'span' },
        { tagName: 'BUTTON', id: 'ast-button', css: 'px-8 py-2 bg-green-600 text-white rounded text-xs',
          text: 'button', onClick: (id) => { lastRendererClick = String(id); } },
      ],
    },
  ];

  // Excluded from this tab: Image, Imagehash, ImageUploader (need CDN routes and a real
  // upload API) and RecordByIDText (needs ui.resolveRecord against a live API route).
  // UiProvider is excluded too — the route layout already provides the runtime.
</script>

<ShowroomBlock name="T" note="resolves an &quot;English|Spanish&quot; string through ui.translate">
  <div class="flex flex-wrap gap-20 text-sm text-gray-700">
    <T text="Save|Guardar" />
    <T text="Delete|Eliminar" css="text-red-600" />
    <T text="No pipe means no split" />
  </div>
</ShowroomBlock>

<ShowroomBlock name="HighlightText" note="marks the matched words inside a string">
  <div class="text-sm text-gray-700">
    <HighlightText words={['lobortis', 'dolor']}
      text="Donec lobortis eleifend condimentum. Cras dictum dolor lacinia lectus vehicula rutrum." />
  </div>
</ShowroomBlock>

<ShowroomBlock name="Info" note="hint box · light background with a colored left rule">
  <Info css="mb-8" text="Leave the purchase amount at 0 for a donated asset.|Deje el monto de compra en 0 para un activo donado." />
  <Info color="green">
    <T text="The asset must be registered as a material first.|El activo debe registrarse como material primero." />
    <a href="#info" class="underline">
      <T text="Register it here.|Regístrelo aqui." />
    </a>
  </Info>
</ShowroomBlock>

<ShowroomBlock name="LoadingBar" note="indeterminate progress, with and without a label">
  <LoadingBar css="mb-12" />
  <LoadingBar label="Syncing records…|Sincronizando registros…" />
</ShowroomBlock>

<ShowroomBlock name="Virtualizer" note="1 000 items · generic vertical virtual list with a children snippet">
  <Virtualizer items={listItems} height="300px" estimatedItemHeight={44}>
    {#snippet children(user, index)}
      <div class="flex items-center gap-10 px-10 py-8 border-b border-gray-200">
        <span class="text-xs text-gray-400 w-40">#{index + 1}</span>
        <span class="text-sm text-gray-700">{user.Name}</span>
        <span class="text-xs text-gray-500 ml-auto">{user.Language}</span>
      </div>
    {/snippet}
  </Virtualizer>
</ShowroomBlock>

<ShowroomBlock name="VirtualCards" note="responsive virtualized card grid · maxColumns=3">
  <VirtualCards items={cardItems} height="340px" maxColumns={3} estimatedRowHeight={120}>
    {#snippet children(user)}
      <div class="border border-gray-200 rounded-md p-12 bg-white h-110">
        <div class="text-sm font-semibold text-gray-700">{user.Name}</div>
        <div class="text-xs text-gray-500">{user.Code}</div>
        <div class="text-xs text-gray-500 mt-4">v{user.Version.toFixed(2)} · {user.Language}</div>
      </div>
    {/snippet}
  </VirtualCards>
</ShowroomBlock>

<ShowroomBlock name="Renderer" note="ElementAST → DOM · the AST owns its own onClick callbacks">
  <Renderer elements={rendererTree} />
  <div class="text-xs text-gray-500 mt-8">last AST click id: {lastRendererClick}</div>
</ShowroomBlock>

<ShowroomBlock name="Portal" note="teleports its children to document.body">
  <Button name={isPortalVisible ? 'Hide portal|Ocultar' : 'Show portal|Mostrar'} color="blue"
    icon="icon-[fa--external-link]" onClick={() => { isPortalVisible = !isPortalVisible; }} />
  {#if isPortalVisible}
    <Portal zIndex={9000}>
      <div class="fixed bottom-20 left-20 bg-gray-800 text-white text-xs px-12 py-8 rounded-md">
        Rendered into document.body, outside this section's DOM subtree.
      </div>
    </Portal>
  {/if}
</ShowroomBlock>

<ShowroomBlock name="FileUploadSelector" note="local pick only — nothing is uploaded here">
  <FileUploadSelector bind:selectedFile extensions={['xlsx', 'pdf', 'csv']}
    buttonLabel="Select file|Seleccionar archivo" />
  <div class="text-xs text-gray-500 mt-8">selected: {selectedFile?.name || '—'}</div>
</ShowroomBlock>

<ShowroomBlock name="HTMLEditor" note="RoosterJS rich text bound with saveOn/save · loaded on demand">
  {#if isEditorLoaded}
    {#await import('../editor/HTMLEditor.svelte') then editorModule}
      <editorModule.default saveOn={editorForm} save="Html" css="min-h-200" />
    {/await}
    <pre class="text-xs text-gray-600 mt-8 overflow-x-auto">{editorForm.Html}</pre>
  {:else}
    <Button name="Load editor|Cargar editor" color="purple" icon="icon-[fa--pencil]"
      onClick={() => { isEditorLoaded = true; }} />
  {/if}
</ShowroomBlock>
