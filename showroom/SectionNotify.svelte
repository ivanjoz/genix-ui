<script lang="ts">
  import { useUI } from '../runtime/index.js';
  import Button from '../buttons/Button.svelte';
  import Input from '../form/Input.svelte';
  import Modal from '../layers/Modal.svelte';
  import {
    confirmWarn, hideLoading, notifyFailure, notifyInfo, notifySuccess, notifyWarning, setLoadingDetail, showLoading,
  } from '../notify/index.js';
  import ShowroomBlock from './ShowroomBlock.svelte';

  const ui = useUI();

  const CONFIRM_MODAL_ID = 21;

  let customToast = $state({ Message: '' });
  let lastConfirmResult = $state('—');

  const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  // The overlay blocks every click, so each loading demo hides itself.
  const runBatchProgress = async () => {
    const totalBatches = 5;
    for (let batchIndex = 1; batchIndex <= totalBatches; batchIndex++) {
      showLoading(`Sending ${batchIndex}/${totalBatches}...|Enviando ${batchIndex}/${totalBatches}...`);
      await wait(700);
    }
    hideLoading();
    notifySuccess('5 batches sent|5 lotes enviados');
  };

  const runDownloadProgress = async () => {
    showLoading('Downloading...|Descargando...');
    for (let downloadedKb = 0; downloadedKb <= 2000; downloadedKb += 250) {
      setLoadingDetail(`${downloadedKb} kb (1.2 MB/s)`);
      await wait(300);
    }
    hideLoading();
  };

  const runFailureWhileLoading = async () => {
    showLoading('Saving...|Guardando...');
    await wait(800);
    notifyFailure('The server rejected the request|El servidor rechazó la solicitud');
    await wait(1500);
    hideLoading();
  };

  const askConfirm = async (label: string, options: Parameters<typeof confirmWarn>[0]) => {
    const confirmed = await confirmWarn(options);
    lastConfirmResult = `${label}: ${confirmed}`;
  };
</script>

<ShowroomBlock name="Toasts" note="bottom-right stack · click dismisses · hover pauses the countdown · failure 5s, warning 4s, others 3s">
  <div class="flex flex-wrap gap-8 mb-12">
    <Button name="notifySuccess" color="green" onClick={() => notifySuccess(customToast.Message || 'Record saved|Registro guardado')} />
    <Button name="notifyFailure" color="red" onClick={() => notifyFailure(customToast.Message || 'The record could not be saved|No se pudo guardar el registro')} />
    <Button name="notifyWarning" color="yellow" onClick={() => notifyWarning(customToast.Message || 'Your session expires in 5 minutes|Su sesión expira en 5 minutos')} />
    <Button name="notifyInfo" color="blue" onClick={() => notifyInfo(customToast.Message || 'There are no changes to send.|No hay cambios a enviar.')} />
    <Button name="Burst of 8 (max 5 visible)" color="purple" onClick={() => {
      for (let toastIndex = 1; toastIndex <= 8; toastIndex++) { notifyInfo(`Toast ${toastIndex} of 8|Toast ${toastIndex} de 8`); }
    }} />
  </div>
  <div class="grid grid-cols-24 gap-10">
    <Input saveOn={customToast} save="Message" css="col-span-24 md:col-span-12" label="Custom message|Mensaje propio" />
    <div class="col-span-24 md:col-span-12 self-center text-[14px] text-fg-muted">
      Empty uses each button's default. Try a long text, or "English|Español" to see the translation.
    </div>
  </div>
</ShowroomBlock>

<ShowroomBlock name="notifyFailure(unknown)" note="whatever a rejected promise carries becomes readable text">
  <div class="flex flex-wrap gap-8">
    <Button name="string" color="red" onClick={() => notifyFailure('Plain string error|Error en texto plano')} />
    <Button name="new Error()" color="red" onClick={() => notifyFailure(new Error('Network down'))} />
    <Button name={'{ error }'} color="red" onClick={() => notifyFailure({ error: 'Invalid user or password' })} />
    <Button name={'{ message }'} color="red" onClick={() => notifyFailure({ message: 'Request timeout' })} />
    <Button name="other object" color="red" onClick={() => notifyFailure({ code: 500, status: 'fail' })} />
    <Button name="null" color="red" onClick={() => notifyFailure(null)} />
  </div>
</ShowroomBlock>

<ShowroomBlock name="Loading overlay" note="blocks the screen until hideLoading(); showLoading() again only replaces the text">
  <div class="flex flex-wrap gap-8">
    <Button name="showLoading 2s" color="blue" onClick={async () => { showLoading('Loading...|Cargando...'); await wait(2000); hideLoading(); }} />
    <Button name="No message 2s" color="blue" onClick={async () => { showLoading(); await wait(2000); hideLoading(); }} />
    <Button name="Batch progress (showLoading)" color="purple" onClick={runBatchProgress} />
    <Button name="Download detail (setLoadingDetail)" color="purple" onClick={runDownloadProgress} />
    <Button name="Failure while loading" color="red" onClick={runFailureWhileLoading} />
  </div>
</ShowroomBlock>

<ShowroomBlock name="confirmWarn" note="resolves true on OK, false on Cancel / Escape · focus starts on Cancel · a newer request cancels the pending one">
  <div class="flex flex-wrap gap-8 mb-8">
    <Button name="Default labels" color="red" onClick={() => askConfirm('default', {
      title: 'Delete record|Eliminar registro', message: 'Delete "Sample"?|¿Eliminar "Sample"?',
    })} />
    <Button name="Custom labels" color="red" onClick={() => askConfirm('custom', {
      title: 'Restore backup|Restaurar backup',
      message: 'The current data will be replaced by the backup of 2026-09-30.|Los datos actuales se reemplazarán por el backup del 2026-09-30.',
      okLabel: 'Restore|Restaurar', cancelLabel: 'Cancel|Cancelar',
    })} />
    <Button name="From inside a Modal" color="orange" onClick={() => ui.openModal(CONFIRM_MODAL_ID)} />
    <Button name="Replaced after 2s" color="orange" onClick={() => {
      void askConfirm('first', { title: 'First request|Primera solicitud', message: 'Wait 2 seconds...|Espere 2 segundos...' });
      setTimeout(() => { void askConfirm('second', { title: 'Second request|Segunda solicitud', message: 'The first one resolved false.|La primera se resolvió en false.' }); }, 2000);
    }} />
  </div>
  <div class="text-[14px] text-fg-muted">last result: {lastConfirmResult}</div>
</ShowroomBlock>

<Modal id={CONFIRM_MODAL_ID} title="Modal with a delete button|Modal con botón eliminar" size={4}
  isEdit={true} onDelete={() => askConfirm('modal', { title: 'Delete record|Eliminar registro', message: 'The confirm must sit above this Modal.|El confirm debe quedar sobre este Modal.' })}>
  <div class="p-8 text-[14px] text-fg-muted">
    Press the red trash button: the confirm opens above the Modal, and Escape cancels only the confirm.
  </div>
</Modal>
