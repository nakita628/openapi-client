import * as z from 'zod'
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

const StatusSchema = z.enum(['todo', 'doing', 'done'])

const UserSchema = z.object({ kind: z.literal('user'), name: z.string() })

const TeamSchema = z.object({ kind: z.literal('team'), members: z.array(UserSchema) })

const TodoSchema = z
  .object({
    id: z.uuid(),
    title: z.string().min(1),
    status: StatusSchema,
    due: z.iso.datetime({ offset: true }).nullable().exactOptional(),
    tags: z.array(z.string()).exactOptional(),
    meta: z.record(z.string(), z.number()).exactOptional(),
    assignee: z.xor([UserSchema, TeamSchema]).exactOptional(),
  })
  .meta({ description: 'A thing to do' })

const NewTodoSchema = z.intersection(
  z.object({ title: z.string() }),
  z.object({ status: StatusSchema.exactOptional() }),
)

type TreeType = { value: number; children: TreeType[] }

const TreeSchema: z.ZodType<TreeType> = z.object({ value: z.number(), children: z.array(z.lazy(() => TreeSchema)) })

const ProblemSchema = z.object({ title: z.string(), status: z.int(), detail: z.string().exactOptional() })

export const routes = {
  getTodosRoute: {
    method: 'get',
    path: '/todos',
    operationId: 'listTodos',
    tags: ['todos'],
    summary: 'List the todos',
    request: {
      query: z.object({ limit: z.int().min(1).exactOptional(), status: StatusSchema.exactOptional() }),
      headers: z.object({ 'x-request-id': z.string() }),
    },
    responses: {
      200: {
        description: 'The todos',
        content: {
          'application/json': { schema: z.array(TodoSchema) },
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
      params: z.object({ id: z.string() }),
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
      params: z.object({ id: z.string() }),
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
          'multipart/form-data': { schema: z.object({ file: z.file(), name: z.string().exactOptional() }) },
        },
      },
    },
    responses: {
      200: {
        description: 'Stored',
        content: {
          'text/plain': { schema: z.string() },
        },
      },
    },
  },
  getTreeRoute: {
    method: 'get',
    path: '/tree',
    operationId: 'getTree',
    request: {
      cookies: z.object({ session: z.string().exactOptional() }),
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
