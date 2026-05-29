(function(global){
  'use strict';

  class ApiError extends Error{
    constructor(message, options = {}){
      super(message || 'Ошибка API');
      this.name = 'ApiError';
      this.status = options.status || 0;
      this.payload = options.payload || null;
      this.details = options.details || null;
      this.nextAvailableAt = options.nextAvailableAt || null;
      this.validationErrors = options.validationErrors || null;
      this.isAuthError = this.status === 401;
      this.isRateLimitError = this.status === 429;
    }
  }

  function normalizeRuntimeConfig(config){
    const target = global || {};
    const flags = (target.RUNTIME_FLAGS && typeof target.RUNTIME_FLAGS === 'object') ? target.RUNTIME_FLAGS : {};
    const origin = target.location && typeof target.location.origin === 'string' ? target.location.origin : '';
    const apiPath = flags.testMode ? '/test/api' : '/api';
    const fallbackBase = origin ? `${origin}${apiPath}` : apiPath;
    const runtime = config && typeof config === 'object' ? config : (target.RUNTIME_CONFIG || {});
    if (!runtime.publicApiBaseUrl) runtime.publicApiBaseUrl = fallbackBase;
    if (!runtime.backendBaseUrl) runtime.backendBaseUrl = fallbackBase;
    return runtime;
  }

  function getRuntimeConfig(){
    const ready = global && global.RUNTIME_CONFIG_READY;
    if (ready && typeof ready.then === 'function'){
      return ready
        .catch(err => {
          console.warn('Runtime-конфигурация недоступна', err);
          return global.RUNTIME_CONFIG;
        })
        .then(() => normalizeRuntimeConfig(global.RUNTIME_CONFIG));
    }
    return Promise.resolve(normalizeRuntimeConfig(global ? global.RUNTIME_CONFIG : null));
  }

  function resolveUrl(path, config){
    const normalizedPath = typeof path === 'string' ? path.trim() : '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(normalizedPath)) return normalizedPath;

    const baseRaw = typeof config?.backendBaseUrl === 'string' ? config.backendBaseUrl.trim() : '';
    if (!baseRaw) return normalizedPath || path;

    const cleanPath = normalizedPath.replace(/^\/+/, '');
    const withTrailingSlash = value => value.endsWith('/') ? value : `${value}/`;
    const origin = global?.location?.origin;
    const candidates = [baseRaw];
    if (origin){
      if (baseRaw.startsWith('/')){
        candidates.push(`${origin}${baseRaw}`);
      }else if (!/^[a-z][a-z0-9+.-]*:/i.test(baseRaw)){
        candidates.push(`${origin}/${baseRaw}`);
      }
    }

    for (const candidate of candidates){
      try{
        return new URL(cleanPath, withTrailingSlash(candidate)).toString();
      }catch(err){
        // Try the next candidate.
      }
    }
    return normalizedPath || path;
  }

  function extractErrorMessage(status, payload){
    if (status === 401) return 'Войдите или зарегистрируйтесь, чтобы продолжить.';
    if (status === 429){
      const next = payload?.next_available_at || payload?.nextAvailableAt || payload?.retry_after || '';
      return next ? `Лимит генерации исчерпан. Следующая попытка: ${next}` : 'Лимит генерации исчерпан. Попробуйте позже.';
    }
    if (status === 400){
      if (payload?.error) return String(payload.error);
      if (Array.isArray(payload?.errors) && payload.errors.length) return payload.errors.join('; ');
      return 'Проверьте заполнение полей.';
    }
    if (status >= 500) return 'Временная ошибка генерации. Попробуйте позже.';
    if (payload?.error) return String(payload.error);
    if (payload?.message) return String(payload.message);
    if (Array.isArray(payload?.errors) && payload.errors.length) return payload.errors.join('; ');
    return status ? `Ошибка API (HTTP ${status})` : 'Ошибка API';
  }

  async function request(path, options = {}){
    const config = await getRuntimeConfig();
    const url = resolveUrl(path, config);
    const headers = { ...(options.headers || {}) };
    const hasBody = Object.prototype.hasOwnProperty.call(options, 'body');
    let body = options.body;
    if (hasBody && body !== null && body !== undefined && typeof body !== 'string' && !(typeof FormData !== 'undefined' && body instanceof FormData)){
      body = JSON.stringify(body);
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      ...options,
      headers,
      body,
      credentials: 'include'
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => ({}))
      : await response.text().catch(() => '');

    if (!response.ok || (payload && typeof payload === 'object' && payload.ok === false)){
      throw new ApiError(extractErrorMessage(response.status, payload), {
        status: response.status,
        payload,
        details: payload?.errors || payload?.details || null,
        nextAvailableAt: payload?.next_available_at || payload?.nextAvailableAt || null,
        validationErrors: response.status === 400 ? (payload?.errors || payload?.details || null) : null
      });
    }

    return payload;
  }

  global.CrocoApiClient = {
    ApiError,
    getRuntimeConfig,
    resolveUrl,
    request,
    formatError: extractErrorMessage
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
