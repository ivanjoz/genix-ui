import { Codec } from 'colbin';

/**
 * Response serialization negotiation with the backend (backend/core/responses.go: WantsColbin).
 *
 * The client announces in `Accept` that it decodes colbin; the backend then answers a self-describing
 * colbin message (the schema travels inside it) and says so in `Content-Type`. Without the
 * announcement the backend answers plain JSON. `Accept` rather than an X-* header because it is
 * CORS-safelisted: no preflight, no AllowHeaders to configure.
 *
 * The decode decision is taken by the response's Content-Type, never by the payload's shape.
 */
export const COLBIN_MEDIA_TYPE = 'application/vnd.colbin';

/** Value of `Accept` announcing that this client decodes colbin. */
export const COLBIN_ACCEPT = `${COLBIN_MEDIA_TYPE}, application/json`;

const COLBIN_DISABLED_STORAGE_KEY = 'genix:colbin-disabled';

/**
 * The Config panel's "disable serialization" switch. It is a veto, not a symmetric switch: it can
 * only stop the announcement, never force one, so the worst a veto does is plain JSON. The service
 * worker has no localStorage, so the veto travels in the headers the page builds for it.
 */
export const isColbinDisabled = (): boolean => {
  try {
    return localStorage.getItem(COLBIN_DISABLED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

export const setColbinDisabled = (disabled: boolean): void => {
  try {
    if (disabled) {
      localStorage.setItem(COLBIN_DISABLED_STORAGE_KEY, '1');
    } else {
      localStorage.removeItem(COLBIN_DISABLED_STORAGE_KEY);
    }
  } catch {
    // An unavailable localStorage (private mode, full storage) must not fail the request.
  }
};

export const isColbinContentType = (contentType?: string | null): boolean =>
  !!contentType && contentType.indexOf(COLBIN_MEDIA_TYPE) !== -1;

// The wasm module is compiled once per realm (page or service worker); every decode after it is sync.
let colbinCodecPromise: Promise<Codec> | undefined;

export const preloadColbinCodec = (): Promise<Codec> => {
  colbinCodecPromise ??= Codec.open();
  return colbinCodecPromise;
};

/**
 * Decodes a colbin response body into JavaScript objects, with no JSON text in the middle.
 *
 * A nil slice on the backend is a colbin `null`, where its JSON path answers `[]`: both routes
 * hand the caller the same empty list.
 */
export const decodeColbinBody = async (body: Uint8Array): Promise<any> => {
  const codec = await preloadColbinCodec();
  return codec.unmarshal(body) ?? [];
};
