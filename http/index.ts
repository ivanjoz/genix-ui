import axios, { type AxiosProgressEvent } from 'axios';
import type { CacheMode, serviceHttpProps } from '../cache/index.js';
import {
  createGroupCacheGetter,
  type GroupCacheGetter,
} from '../cache/group-cache.fetch.js';
import { unmarshall } from '../utilities/unmarshall.js';

export * from './get-handler.svelte.js';
export type { AxiosProgressEvent };

export interface IHttpStatus {
  code: number;
  message: string;
  metadata?: {
    preSerializeMs: number;
    finalMs: number;
  };
}

export interface httpProps {
  data?: any;
  route: string;
  apiName?: string;
  headers?: Record<string, string>;
  successMessage?: string;
  errorMessage?: string;
  module?: string;
  onUploadProgress?: (event: AxiosProgressEvent) => void;
  status?: IHttpStatus;
  refreshRoutes?: string[];
  keysIDs?: Record<string, string | string[]>;
  keyID?: string | string[];
  columnarIDField?: string;
  combineColumnarValuesOnFields?: string[];
  cacheMode?: CacheMode;
  useCache?: {
    min: number;
    ver: number;
  };
  useCacheStatic?: {
    min: number;
    ver: number;
  };
  contentLength?: number;
}

export interface HttpClientRuntime {
  makeRoute: (route: string) => string;
  getToken: () => string;
  transformResponse?: (response: any) => any;
  notify?: {
    failure?: (message: string) => void;
    success?: (message: string) => void;
  };
  onUnauthorized?: () => void;
  startRequest?: (route: string) => number;
  finishRequest?: (requestId: number) => void;
  fetchCached?: (request: serviceHttpProps) => Promise<any>;
  refreshRoutes?: (routes: string[]) => Promise<unknown> | void;
  verifyRouteMemoryState?: () => boolean;
}

export interface HttpClient {
  buildHeaders: (contentType?: string) => Record<string, string>;
  GET: (props: httpProps) => Promise<any>;
  GETWithGroupCache: GroupCacheGetter;
  POST: (props: httpProps) => Promise<any>;
  PUT: (props: httpProps) => Promise<any>;
  POST_XMLHR: (props: httpProps) => Promise<any>;
}

const extractError = (result: any): string => {
  let errorValue: any;
  let errorMessage = '';

  if (typeof result === 'string') {
    errorMessage = result.trim();
    if (errorMessage[0] === '{' || errorMessage[0] === '[') {
      try {
        errorValue = JSON.parse(errorMessage);
      } catch {
        // Keep the original response text when it is not valid JSON.
      }
    }
  } else {
    errorValue = result;
  }

  if (errorValue) {
    if (Array.isArray(errorValue)) {
      errorValue = errorValue[0];
    }
    if (errorValue.message || errorValue.error || errorValue.errorMessage) {
      errorValue = errorValue.message || errorValue.error || errorValue.errorMessage;
    }
    errorMessage = typeof errorValue === 'string'
      ? errorValue
      : JSON.stringify(errorValue);
  }

  return errorMessage;
};

const setResponseMetadata = (headers: Headers, status: IHttpStatus): void => {
  const rawMetadata = headers.get('X-Metadata') || '';
  if (!rawMetadata) { return; }

  const [preSerializeMsRaw, finalMsRaw] = rawMetadata.split(',');
  status.metadata = {
    preSerializeMs: parseInt(preSerializeMsRaw || '0'),
    finalMs: parseInt(finalMsRaw || '0'),
  };
};

export const createHttpClient = (runtime: HttpClientRuntime): HttpClient => {
  // Genix compact responses are decoded by default; lower-level clients may override this.
  const transformResponse = runtime.transformResponse ?? unmarshall;
  const notifyFailure = runtime.notify?.failure ?? ((message) => console.error(message));
  const notifySuccess = runtime.notify?.success ?? (() => {});

  const buildHeaders = (contentType?: string): Record<string, string> => {
    const contentTypes: Record<string, string> = { json: 'application/json' };
    const headers: Record<string, string> = {
      Authorization: `Bearer ${runtime.getToken()}`,
    };

    if (contentType && contentTypes[contentType]) {
      headers['Content-Type'] = contentTypes[contentType];
    }
    return headers;
  };

  const parsePreResponse = async (response: Response, status: IHttpStatus): Promise<any> => {
    const contentType = response.headers.get('content-type');
    status.code = response.status;
    status.message = response.statusText;
    setResponseMetadata(response.headers, status);

    if (response.status === 200) {
      return response.json();
    }
    if (response.status === 401) {
      console.warn('[http] Unauthorized response:', response.url);
      runtime.onUnauthorized?.();
      return undefined;
    }
    return !contentType || !contentType.includes('/json')
      ? response.text()
      : response.json();
  };

  const hasSuccessfulResponse = (
    rawResponse: any,
    props: httpProps,
    status: IHttpStatus,
  ): boolean => {
    const response = rawResponse || 'Hubo un error desconocido en el servidor';
    const isSuccessful = status.code === 200 && !response.errorMessage;

    if (!isSuccessful) {
      console.warn('[http] Request failed:', response);
      notifyFailure(extractError(response));
      return false;
    }
    if (props.successMessage) {
      notifySuccess(props.successMessage);
    }
    return true;
  };

  const refreshChangedRoutes = (routes: string[] | undefined): void => {
    if (!routes?.length || !runtime.refreshRoutes) { return; }

    console.log('[http] Marking routes for refresh:', routes);
    Promise.resolve(runtime.refreshRoutes(routes))
      .then(() => console.log('[http] Routes marked for refresh:', routes))
      .catch((error) => console.warn('[http] Failed to mark routes for refresh:', error));
  };

  const write = async (props: httpProps, method: 'POST' | 'PUT'): Promise<any> => {
    if (typeof props.data !== 'object') {
      throw new Error('The data provided is not JSON');
    }

    const status = props.status || { code: 200, message: '' };
    const requestId = runtime.startRequest?.(props.route) || 0;

    try {
      console.log(`[http] ${method}:`, props.route);
      const response = await fetch(runtime.makeRoute(props.route), {
        method,
        headers: buildHeaders('json'),
        body: JSON.stringify(props.data),
      });
      const result = transformResponse(await parsePreResponse(response, status));

      if (!hasSuccessfulResponse(result, props, status)) {
        return Promise.reject(result);
      }
      refreshChangedRoutes(props.refreshRoutes);
      return result;
    } catch (error) {
      console.error(`[http] ${method} failed:`, props.route, error);
      notifyFailure(props.errorMessage || String(error));
      throw error;
    } finally {
      if (requestId > 0) {
        runtime.finishRequest?.(requestId);
      }
    }
  };

  const POST_XMLHR = async (props: httpProps): Promise<any> => {
    if (typeof props.data !== 'object') {
      throw new Error('The data provided is not JSON');
    }

    props.status = { code: 200, message: '' };
    refreshChangedRoutes(props.refreshRoutes);

    try {
      console.log('[http] Upload POST:', props.route);
      const response = await axios.post(runtime.makeRoute(props.route), props.data, {
        onUploadProgress: props.onUploadProgress,
        headers: { authorization: `Bearer ${runtime.getToken()}` },
      });
      const result = transformResponse(response.data);

      if (response.status !== 200) {
        const message = result?.message || result?.error || result?.errorMessage || String(result);
        notifyFailure(String(message));
        return Promise.reject(result);
      }
      return result;
    } catch (rawError) {
      const error = (rawError as any)?.response?.data || rawError;
      const message = error?.message || error?.error || error?.errorMessage || String(error);
      console.error('[http] Upload POST failed:', props.route, error);
      notifyFailure(String(message));
      throw error;
    }
  };

  const GET = async (props: httpProps): Promise<any> => {
    const status = props.status || { code: 200, message: '' };
    const routeParsed = runtime.makeRoute(props.route);

    if (props.useCache) {
      if (!runtime.fetchCached) {
        throw new Error('[http] Cached GET requested without a fetchCached adapter');
      }
      const cacheRequest = {
        routeParsed,
        route: props.route,
        useCache: props.useCache,
        module: props.module || 'a',
        headers: buildHeaders('json'),
        cacheMode: props.cacheMode,
        verifyRouteMemoryState: runtime.verifyRouteMemoryState?.() ?? false,
        status,
        keyID: props.keyID,
        keysIDs: props.keysIDs,
        columnarIDField: props.columnarIDField,
        combineColumnarValuesOnFields: props.combineColumnarValuesOnFields,
      } as serviceHttpProps;
      return runtime.fetchCached(cacheRequest);
    }

    const requestId = runtime.startRequest?.(props.route) || 0;
    try {
      console.log('[http] GET:', props.route);
      const response = await fetch(routeParsed, { headers: buildHeaders() });
      const result = transformResponse(await parsePreResponse(response, status));

      if (!hasSuccessfulResponse(result, props, status)) {
        return Promise.reject(result);
      }
      return result;
    } catch (error) {
      console.warn('[http] GET failed:', props.route, error);
      if (props.errorMessage) {
        notifyFailure(props.errorMessage);
      }
      throw error;
    } finally {
      if (requestId > 0) {
        runtime.finishRequest?.(requestId);
      }
    }
  };

  return {
    buildHeaders,
    GET,
    GETWithGroupCache: createGroupCacheGetter({
      get: (route) => GET({ route }),
    }),
    POST: (props) => write(props, 'POST'),
    PUT: (props) => write(props, 'PUT'),
    POST_XMLHR,
  };
};
