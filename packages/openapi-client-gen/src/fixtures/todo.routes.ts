import { schema } from 'openapi-client'
import type {
  AliasRequestOptions,
  ClientErrorStatusCode,
  ClientRequestOptions,
  ClientResponse,
  PathEndpoint,
  RequestValidationProblem,
  ResponseValidationProblem,
  RouteConfig,
  UrlEndpoint,
} from 'openapi-client'

type Status = 'todo' | 'doing' | 'done'

type Todo = {
  id: string
  title: string
  status: Status
  due?: string | null
  tags?: string[]
  meta?: { [key: string]: number }
  assignee?: User | Team
}

type NewTodo = { title: string } & { status?: Status }

type User = { kind: 'user'; name: string }

type Team = { kind: 'team'; members: User[] }

type Tree = { value: number; children: Tree[] }

type Problem = { title: string; status: number; detail?: string }

export const routes = {
  getTodosRoute: {
    method: 'get',
    path: '/todos',
    operationId: 'listTodos',
    tags: ['todos'],
    summary: 'List the todos',
    request: {
      query: schema<{ limit?: number; status?: Status }>(),
      headers: schema<{ 'x-request-id': string }>(),
    },
    responses: {
      200: {
        description: 'The todos',
        content: {
          'application/json': { schema: schema<Todo[]>() },
        },
      },
      default: {
        description: 'A problem',
        content: {
          'application/problem+json': { schema: schema<Problem>() },
        },
      },
    },
  },
  postTodosRoute: {
    method: 'post',
    path: '/todos',
    operationId: 'create-todo',
    tags: ['todos'],
    request: {
      body: {
        required: true,
        content: {
          'application/json': { schema: schema<NewTodo>() },
        },
      },
    },
    responses: {
      201: {
        description: 'Created',
        content: {
          'application/json': { schema: schema<Todo>() },
        },
      },
      '4XX': {
        description: 'A problem',
        content: {
          'application/problem+json': { schema: schema<Problem>() },
        },
      },
    },
  },
  getTodosIdRoute: {
    method: 'get',
    path: '/todos/{id}',
    operationId: 'getTodo',
    tags: ['todos'],
    request: {
      params: schema<{ id: string }>(),
    },
    responses: {
      200: {
        description: 'The todo',
        content: {
          'application/json': { schema: schema<Todo>() },
        },
      },
      404: {
        description: 'A problem',
        content: {
          'application/problem+json': { schema: schema<Problem>() },
        },
      },
    },
  },
  deleteTodosIdRoute: {
    method: 'delete',
    path: '/todos/{id}',
    tags: ['todos'],
    deprecated: true,
    request: {
      params: schema<{ id: string }>(),
    },
    responses: {
      204: {
        description: 'Deleted',
      },
    },
  },
  postFilesRoute: {
    method: 'post',
    path: '/files',
    operationId: 'uploadFile',
    request: {
      body: {
        required: false,
        content: {
          'multipart/form-data': { schema: schema<{ file: Blob; name?: string }>() },
        },
      },
    },
    responses: {
      200: {
        description: 'Stored',
        content: {
          'text/plain': { schema: schema<string>() },
        },
      },
    },
  },
  getTreeRoute: {
    method: 'get',
    path: '/tree',
    operationId: 'getTree',
    request: {
      cookies: schema<{ session?: string }>(),
    },
    responses: {
      200: {
        description: 'The tree',
        content: {
          'application/json': { schema: schema<Tree>() },
        },
      },
    },
  },
} as const satisfies Record<string, RouteConfig>

export type Client = {
  readonly todos: {
    readonly $get: (
      args: { readonly query: { limit?: number; status?: Status }; readonly header: { 'x-request-id': string } },
      options?: ClientRequestOptions,
    ) => Promise<
      | ClientResponse<Todo[], 200, 'json'>
      | ClientResponse<Problem, number, 'json'>
      | ClientResponse<RequestValidationProblem, 422, 'json'>
      | ClientResponse<ResponseValidationProblem, 502, 'json'>
    >
    readonly $post: (
      args: { readonly json: NewTodo },
      options?: ClientRequestOptions,
    ) => Promise<
      | ClientResponse<Todo, 201, 'json'>
      | ClientResponse<Problem, ClientErrorStatusCode, 'json'>
      | ClientResponse<RequestValidationProblem, 422, 'json'>
      | ClientResponse<ResponseValidationProblem, 502, 'json'>
    >
    readonly $url: UrlEndpoint<typeof routes.getTodosRoute | typeof routes.postTodosRoute>
    readonly $path: PathEndpoint<typeof routes.getTodosRoute | typeof routes.postTodosRoute>
    readonly ':id': {
      readonly $get: (
        args: { readonly param: { id: string } },
        options?: ClientRequestOptions,
      ) => Promise<
        | ClientResponse<Todo, 200, 'json'>
        | ClientResponse<Problem, 404, 'json'>
        | ClientResponse<RequestValidationProblem, 422, 'json'>
        | ClientResponse<ResponseValidationProblem, 502, 'json'>
      >
      readonly $delete: (
        args: { readonly param: { id: string } },
        options?: ClientRequestOptions,
      ) => Promise<
        | ClientResponse<undefined, 204, 'none'>
        | ClientResponse<RequestValidationProblem, 422, 'json'>
        | ClientResponse<ResponseValidationProblem, 502, 'json'>
      >
      readonly $url: UrlEndpoint<typeof routes.getTodosIdRoute | typeof routes.deleteTodosIdRoute>
      readonly $path: PathEndpoint<typeof routes.getTodosIdRoute | typeof routes.deleteTodosIdRoute>
    }
  }
  readonly files: {
    readonly $post: (
      args?: { readonly form?: { file: Blob; name?: string } },
      options?: ClientRequestOptions,
    ) => Promise<
      | ClientResponse<string, 200, 'text'>
      | ClientResponse<RequestValidationProblem, 422, 'json'>
      | ClientResponse<ResponseValidationProblem, 502, 'json'>
    >
    readonly $url: UrlEndpoint<typeof routes.postFilesRoute>
    readonly $path: PathEndpoint<typeof routes.postFilesRoute>
  }
  readonly tree: {
    readonly $get: (
      args: { readonly cookie: { session?: string } },
      options?: ClientRequestOptions,
    ) => Promise<
      | ClientResponse<Tree, 200, 'json'>
      | ClientResponse<RequestValidationProblem, 422, 'json'>
      | ClientResponse<ResponseValidationProblem, 502, 'json'>
    >
    readonly $url: UrlEndpoint<typeof routes.getTreeRoute>
    readonly $path: PathEndpoint<typeof routes.getTreeRoute>
  }
  readonly listTodos: (
    config: {
      readonly queries?: { limit?: number; status?: Status }
      readonly headers: { 'x-request-id': string }
    } & AliasRequestOptions,
  ) => Promise<Todo[]>
  readonly createTodo: (body: NewTodo, config?: AliasRequestOptions) => Promise<Todo>
  readonly getTodo: (config: { readonly params: { id: string } } & AliasRequestOptions) => Promise<Todo>
  readonly uploadFile: (
    body: { file: Blob; name?: string } | undefined,
    config?: AliasRequestOptions,
  ) => Promise<string>
  readonly getTree: (config?: { readonly cookies?: { session?: string } } & AliasRequestOptions) => Promise<Tree>
}
