import { type, scope } from 'arktype'
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

const StatusSchema = type("'todo' | 'doing' | 'done'")

const UserSchema = type({ kind: "'user'", name: 'string' })

const TeamSchema = type({ kind: "'team'", members: type(UserSchema).array() })

const TodoSchema = type({
  id: 'string.uuid',
  title: type('string').narrow((data, ctx) => [...data].length >= 1 || ctx.mustBe('at least 1 character')),
  status: StatusSchema,
  'due?': type(
    type(
      /^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|([+-](?:[01]\d|2[0-3]):[0-5]\d)))$/,
    ),
  ).or('null'),
  'tags?': 'string[]',
  'meta?': type({ '[string]': 'number' }),
  'assignee?': type(UserSchema).or(TeamSchema),
}).describe('A thing to do')

const NewTodoSchema = type(type({ title: 'string' })).and(type({ 'status?': StatusSchema }))

const TreeSchema = scope({ TreeSchema: { value: 'number', children: 'TreeSchema[]' } }).export().TreeSchema

const ProblemSchema = type({ title: 'string', status: 'number.integer', 'detail?': 'string' })

export const routes = {
  getTodosRoute: {
    method: 'get',
    path: '/todos',
    operationId: 'listTodos',
    tags: ['todos'],
    summary: 'List the todos',
    request: {
      query: type({ 'limit?': 'number.integer >= 1', 'status?': StatusSchema }),
      headers: type({ 'x-request-id': 'string' }),
    },
    responses: {
      200: {
        description: 'The todos',
        content: {
          'application/json': { schema: type(TodoSchema).array() },
        },
      },
      default: {
        description: 'A problem',
        content: {
          'application/problem+json': { schema: ProblemSchema },
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
          'application/json': { schema: NewTodoSchema },
        },
      },
    },
    responses: {
      201: {
        description: 'Created',
        content: {
          'application/json': { schema: TodoSchema },
        },
      },
      '4XX': {
        description: 'A problem',
        content: {
          'application/problem+json': { schema: ProblemSchema },
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
      params: type({ id: 'string' }),
    },
    responses: {
      200: {
        description: 'The todo',
        content: {
          'application/json': { schema: TodoSchema },
        },
      },
      404: {
        description: 'A problem',
        content: {
          'application/problem+json': { schema: ProblemSchema },
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
      params: type({ id: 'string' }),
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
          'multipart/form-data': { schema: type({ file: 'File', 'name?': 'string' }) },
        },
      },
    },
    responses: {
      200: {
        description: 'Stored',
        content: {
          'text/plain': { schema: type('string') },
        },
      },
    },
  },
  getTreeRoute: {
    method: 'get',
    path: '/tree',
    operationId: 'getTree',
    request: {
      cookies: type({ 'session?': 'string' }),
    },
    responses: {
      200: {
        description: 'The tree',
        content: {
          'application/json': { schema: TreeSchema },
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
      args?: { readonly form?: { file: File; name?: string } },
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
    body: { file: File; name?: string } | undefined,
    config?: AliasRequestOptions,
  ) => Promise<string>
  readonly getTree: (config?: { readonly cookies?: { session?: string } } & AliasRequestOptions) => Promise<Tree>
}
