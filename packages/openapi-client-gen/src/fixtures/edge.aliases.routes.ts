import { schema } from 'openapi-client'
import type {
  AliasRequestOptions,
  ClientRequestOptions,
  ClientResponse,
  InfoStatusCode,
  PathEndpoint,
  RedirectStatusCode,
  RequestValidationProblem,
  ResponseValidationProblem,
  RouteConfig,
  ServerErrorStatusCode,
  SuccessStatusCode,
  UrlEndpoint,
} from 'openapi-client'

type Item = { id: string; name?: string }

export const routes = {
  getRoute: {
    method: 'get',
    path: '/',
    operationId: 'getIndex',
    responses: {
      200: {
        description: 'ok',
        content: {
          'text/html': {},
        },
      },
    },
  },
  headHealthRoute: {
    method: 'head',
    path: '/health',
    operationId: 'health',
    responses: {
      204: {
        description: 'up',
      },
    },
  },
  getItemsIdRoute: {
    method: 'get',
    path: '/items/{id}',
    operationId: 'getItem',
    responses: {
      '2XX': {
        description: 'the item',
        content: {
          'application/merge-patch+json': { schema: schema<Item>() },
        },
      },
      '3XX': {
        description: 'moved',
      },
      '5XX': {
        description: 'failed',
        content: {
          'application/problem+json': {},
        },
      },
      default: {
        description: 'anything else',
        content: {
          'application/octet-stream': {},
        },
      },
    },
  },
  patchItemsIdRoute: {
    method: 'patch',
    path: '/items/{id}',
    operationId: 'patchItem',
    request: {
      body: {
        required: false,
        content: {
          'application/merge-patch+json': { schema: schema<{ name?: string }>() },
          'application/json': { schema: schema<Item>() },
        },
      },
    },
    responses: {
      200: {
        description: 'ok',
        content: {
          'application/json': { schema: schema<Item>() },
        },
      },
    },
  },
  putUploadsRoute: {
    method: 'put',
    path: '/uploads',
    operationId: 'putUpload',
    request: {
      headers: schema<{ 'x-size'?: number }>(),
      body: {
        required: true,
        content: {
          'application/octet-stream': {},
        },
      },
    },
    responses: {
      200: {
        description: 'ok',
      },
      '1XX': {
        description: 'continue',
      },
    },
  },
  postUploadsRoute: {
    method: 'post',
    path: '/uploads',
    operationId: 'upload',
    request: {
      body: {
        required: true,
        content: {
          'application/x-www-form-urlencoded': {},
          'multipart/form-data': {},
        },
      },
    },
    responses: {
      201: {
        description: 'stored',
        content: {
          'text/plain': { schema: schema<string>() },
        },
      },
    },
  },
  deleteABCDRoute: {
    method: 'delete',
    path: '/a/{b}/c/{d}',
    operationId: 'removeD',
    request: {
      params: schema<{ b: string }>(),
      query: schema<{ q?: string }>(),
    },
    responses: {
      202: {
        description: 'accepted',
        content: {
          'application/json': {},
        },
      },
    },
  },
  querySearchRoute: {
    method: 'query',
    path: '/search',
    operationId: 'searchItems',
    request: {
      body: {
        required: true,
        content: {
          'application/json': { schema: schema<{ q: string }>() },
        },
      },
    },
    responses: {
      200: {
        description: 'the hits',
        content: {
          'application/json': { schema: schema<Item[]>() },
        },
      },
    },
  },
} as const satisfies Record<string, RouteConfig>

export type Client = {
  readonly index: {
    readonly $get: (
      args?: {},
      options?: ClientRequestOptions,
    ) => Promise<
      | ClientResponse<string, 200, 'text'>
      | ClientResponse<RequestValidationProblem, 422, 'json'>
      | ClientResponse<ResponseValidationProblem, 502, 'json'>
    >
    readonly $url: UrlEndpoint<typeof routes.getRoute>
    readonly $path: PathEndpoint<typeof routes.getRoute>
  }
  readonly health: ((config?: AliasRequestOptions) => Promise<undefined>) & {
    readonly $head: (
      args?: {},
      options?: ClientRequestOptions,
    ) => Promise<
      | ClientResponse<undefined, 204, 'none'>
      | ClientResponse<RequestValidationProblem, 422, 'json'>
      | ClientResponse<ResponseValidationProblem, 502, 'json'>
    >
    readonly $url: UrlEndpoint<typeof routes.headHealthRoute>
    readonly $path: PathEndpoint<typeof routes.headHealthRoute>
  }
  readonly items: {
    readonly ':id': {
      readonly $get: (
        args: { readonly param: { readonly id: string | number } },
        options?: ClientRequestOptions,
      ) => Promise<
        | ClientResponse<Item, SuccessStatusCode, 'json'>
        | ClientResponse<undefined, RedirectStatusCode, 'none'>
        | ClientResponse<unknown, ServerErrorStatusCode, 'json'>
        | ClientResponse<unknown, number, 'body'>
        | ClientResponse<RequestValidationProblem, 422, 'json'>
        | ClientResponse<ResponseValidationProblem, 502, 'json'>
      >
      readonly $patch: (
        args: { readonly param: { readonly id: string | number }; readonly json?: Item },
        options?: ClientRequestOptions,
      ) => Promise<
        | ClientResponse<Item, 200, 'json'>
        | ClientResponse<RequestValidationProblem, 422, 'json'>
        | ClientResponse<ResponseValidationProblem, 502, 'json'>
      >
      readonly $url: UrlEndpoint<typeof routes.getItemsIdRoute | typeof routes.patchItemsIdRoute>
      readonly $path: PathEndpoint<typeof routes.getItemsIdRoute | typeof routes.patchItemsIdRoute>
    }
  }
  readonly uploads: {
    readonly $put: (
      args: { readonly header: { 'x-size'?: number } },
      options?: ClientRequestOptions,
    ) => Promise<
      | ClientResponse<undefined, 200, 'none'>
      | ClientResponse<undefined, InfoStatusCode, 'none'>
      | ClientResponse<RequestValidationProblem, 422, 'json'>
      | ClientResponse<ResponseValidationProblem, 502, 'json'>
    >
    readonly $post: (
      args: { readonly form: Readonly<Record<string, string | Blob | readonly (string | Blob)[]>> },
      options?: ClientRequestOptions,
    ) => Promise<
      | ClientResponse<string, 201, 'text'>
      | ClientResponse<RequestValidationProblem, 422, 'json'>
      | ClientResponse<ResponseValidationProblem, 502, 'json'>
    >
    readonly $url: UrlEndpoint<typeof routes.putUploadsRoute | typeof routes.postUploadsRoute>
    readonly $path: PathEndpoint<typeof routes.putUploadsRoute | typeof routes.postUploadsRoute>
  }
  readonly a: {
    readonly ':b': {
      readonly c: {
        readonly ':d': {
          readonly $delete: (
            args: { readonly param: { b: string }; readonly query: { q?: string } },
            options?: ClientRequestOptions,
          ) => Promise<
            | ClientResponse<unknown, 202, 'json'>
            | ClientResponse<RequestValidationProblem, 422, 'json'>
            | ClientResponse<ResponseValidationProblem, 502, 'json'>
          >
          readonly $url: UrlEndpoint<typeof routes.deleteABCDRoute>
          readonly $path: PathEndpoint<typeof routes.deleteABCDRoute>
        }
      }
    }
  }
  readonly search: {
    readonly $query: (
      args: { readonly json: { q: string } },
      options?: ClientRequestOptions,
    ) => Promise<
      | ClientResponse<Item[], 200, 'json'>
      | ClientResponse<RequestValidationProblem, 422, 'json'>
      | ClientResponse<ResponseValidationProblem, 502, 'json'>
    >
    readonly $url: UrlEndpoint<typeof routes.querySearchRoute>
    readonly $path: PathEndpoint<typeof routes.querySearchRoute>
  }
  readonly getIndex: (config?: AliasRequestOptions) => Promise<string>
  readonly getItem: (
    config: { readonly params: { readonly id: string | number } } & AliasRequestOptions,
  ) => Promise<Item | undefined>
  readonly patchItem: (
    body: Item | undefined,
    config: { readonly params: { readonly id: string | number } } & AliasRequestOptions,
  ) => Promise<Item>
  readonly putUpload: (
    body: undefined,
    config?: { readonly headers?: { 'x-size'?: number } } & AliasRequestOptions,
  ) => Promise<undefined>
  readonly upload: (
    body: Readonly<Record<string, string | Blob | readonly (string | Blob)[]>>,
    config?: AliasRequestOptions,
  ) => Promise<string>
  readonly removeD: (
    body: undefined,
    config: { readonly params: { b: string }; readonly queries?: { q?: string } } & AliasRequestOptions,
  ) => Promise<unknown>
  readonly searchItems: (body: { q: string }, config?: AliasRequestOptions) => Promise<Item[]>
}
