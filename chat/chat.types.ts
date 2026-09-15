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

export interface ChatMessageItem {
  kind: 'message';
  id: string;
  role: ChatRole;
  text: string;
  /** El texto todavía está llegando: se renderiza plano, sin parsear Markdown. */
  streaming?: boolean;
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
