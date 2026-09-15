/**
 * Modelo de un hilo de conversación con un agente.
 *
 * Deliberadamente agnóstico del transporte: el paquete no sabe si detrás hay
 * SSE, WebSocket o polling, ni qué forma tienen los mensajes del proveedor.
 * El host traduce lo suyo a estos tipos.
 */

export type ChatRole = 'user' | 'assistant';

/** Estado de una acción que el agente ejecutó mientras respondía. */
export type ChatActivityState = 'running' | 'ok' | 'error';

/**
 * Lo que hace falta para **pintar** un adjunto. Todo menos el nombre es
 * opcional porque también sirve para los que aún no se han mandado: un archivo
 * recién soltado en el composer no tiene URL hasta que el host lo sube.
 */
export interface ChatAttachmentView {
  name: string;
  /** Tamaño en bytes. Omitido u `0` no pinta el peso. */
  bytes?: number;
  /** Decide cómo se pinta: miniatura (`image`) o chip con icono. */
  kind?: 'image' | 'pdf' | 'file';
  /** Dónde se abre al pulsarlo, y de dónde sale la miniatura. */
  url?: string;
}

/**
 * Un adjunto que ya existe en el hilo: el host lo guardó y sabe todo de él.
 * Esto es lo que viaja en un `ChatMessageItem`.
 */
export interface ChatAttachmentRef extends ChatAttachmentView {
  bytes: number;
  kind: 'image' | 'pdf' | 'file';
  url: string;
}

export interface ChatMessageItem {
  kind: 'message';
  id: string;
  role: ChatRole;
  text: string;
  /** El texto todavía está llegando: se renderiza plano, sin parsear Markdown. */
  streaming?: boolean;
  /** Archivos que se mandaron con el mensaje. */
  attachments?: ChatAttachmentRef[];
}

export interface ChatActivityItem {
  kind: 'activity';
  id: string;
  /** Nombre de la acción: `Read`, `Search`, `Write`… */
  tool: string;
  /** Descripción corta: la ruta, el patrón buscado, lo que dé contexto. */
  label: string;
  state: ChatActivityState;
  /** Motivo, cuando `state` es `error`. */
  detail?: string;
}

export type ChatItem = ChatMessageItem | ChatActivityItem;
