# HTTP Clients

## Table of Contents

- [Minimal Example](#minimal-example)
- [Building Requests](#building-requests)
- [Response Decoding](#response-decoding)
- [Client Middleware](#client-middleware)
- [Error Handling](#error-handling)
- [Retries](#retries)
- [Worked Example: Typed API Service](#worked-example-typed-api-service)
- [Quick Reference](#quick-reference)

## Minimal Example

```typescript
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/unstable/http"
import { Effect, Schema } from "effect"

const Repo = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  full_name: Schema.String,
  stargazers_count: Schema.Number,
})

const program = Effect.gen(function* () {
  const response = yield* HttpClient.get("https://api.github.com/repos/Effect-TS/effect")
  const repo = yield* HttpClientResponse.schemaBodyJson(Repo)(response)
  console.log(`${repo.full_name}: ${repo.stargazers_count} stars`)
})

program.pipe(Effect.provide(FetchHttpClient.layer), Effect.runPromise)
```

- `HttpClient.get` returns an Effect requiring `HttpClient` in context
- `HttpClientResponse.schemaBodyJson` decodes and validates the JSON body
- `FetchHttpClient.layer` provides the implementation using `fetch`

## Building Requests

### Headers

```typescript
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"

const request = HttpClientRequest.get("https://api.github.com/repos/Effect-TS/effect").pipe(
  HttpClientRequest.setHeader("Accept", "application/vnd.github.v3+json"),
  HttpClientRequest.bearerToken("ghp_xxxx"),
)
const response = yield* HttpClient.execute(request)
```

Helpers: `setHeader`, `setHeaders`, `bearerToken`, `basicAuth`, `acceptJson`.

### Query Parameters

```typescript
const request = HttpClientRequest.get("https://api.github.com/search/repositories").pipe(
  HttpClientRequest.setUrlParam("q", "effect language:typescript"),
  HttpClientRequest.setUrlParam("sort", "stars"),
)
```

### Request Body

Use `HttpClientRequest.schemaBodyJson` (returns an Effect because encoding can fail):

```typescript
const CreateIssue = Schema.Struct({ title: Schema.String, body: Schema.String })

const request = yield* HttpClientRequest.post(`https://api.github.com/repos/${owner}/${repo}/issues`).pipe(
  HttpClientRequest.schemaBodyJson(CreateIssue)({ title: "Bug", body: "Description" })
)
const response = yield* HttpClient.execute(request)
```

## Response Decoding

### Schema-validated JSON body

```typescript
const response = yield* HttpClient.get("https://api.github.com/users/effect-ts")
const user = yield* HttpClientResponse.schemaBodyJson(User)(response)
```

### Status code matching

```typescript
const result = yield* HttpClientResponse.matchStatus(response, {
  "2xx": HttpClientResponse.schemaBodyJson(User),
  404: () => Effect.fail(new UserNotFound(username)),
  orElse: (r) => Effect.fail(new Error(`Unexpected: ${r.status}`)),
})
```

### Filter 2xx only

```typescript
yield* HttpClientResponse.filterStatusOk(response) // fails on non-2xx
const user = yield* HttpClientResponse.schemaBodyJson(User)(response)
```

## Client Middleware

Use `HttpClient.mapRequest` for transformations applied to all requests:

```typescript
import { flow } from "effect"

const GitHubClient = Layer.effect(
  HttpClient.HttpClient,
  Effect.gen(function* () {
    const baseClient = yield* HttpClient.HttpClient
    return baseClient.pipe(
      HttpClient.mapRequest(
        flow(
          HttpClientRequest.prependUrl("https://api.github.com"),
          HttpClientRequest.bearerToken("ghp_xxxx"),
          HttpClientRequest.setHeader("Accept", "application/vnd.github.v3+json"),
        )
      )
    )
  })
).pipe(Layer.provide(FetchHttpClient.layer))
```

## Error Handling

```typescript
const program = Effect.gen(function* () {
  const response = yield* HttpClient.get("https://api.example.com/data")
  return yield* HttpClientResponse.schemaBodyJson(Data)(response)
}).pipe(
  Effect.catchTag("RequestError", (e) =>
    Effect.fail(`Network error: ${e.reason}`)
  ),
  Effect.catchTag("ResponseError", (e) =>
    Effect.fail(`HTTP ${e.response.status}: ${e.reason}`)
  ),
)
```

- `RequestError`: network failures, DNS errors, timeouts
- `ResponseError`: non-2xx status (with `filterStatusOk`) or body parsing failures

## Retries

Manual retry with schedule:

```typescript
const withRetry = program.pipe(
  Effect.retry(Schedule.exponential("100 millis").pipe(
    Schedule.compose(Schedule.recurs(3))
  ))
)
```

Built-in transient retry (rate limiting, timeouts, 5xx):

```typescript
const ResilientClient = Layer.effect(
  HttpClient.HttpClient,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    return client.pipe(HttpClient.retryTransient({ times: 3 }))
  })
).pipe(Layer.provide(FetchHttpClient.layer))
```

## Worked Example: Typed API Service

```typescript
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { Effect, Layer, Schema, ServiceMap } from "effect"

const UserId = Schema.Number.pipe(Schema.brand("UserId"))
type UserId = typeof UserId.Type

class User extends Schema.Class("User")({
  id: UserId,
  login: Schema.String,
  name: Schema.NullOr(Schema.String),
  public_repos: Schema.Number,
}) {}

class Repo extends Schema.Class("Repo")({
  id: Schema.Number,
  name: Schema.String,
  full_name: Schema.String,
  stargazers_count: Schema.Number,
}) {}

class GitHubApi extends ServiceMap.Service<
  GitHubApi,
  {
    readonly getUser: (username: string) => Effect.Effect<User>
    readonly getRepo: (owner: string, repo: string) => Effect.Effect<Repo>
    readonly listRepos: (username: string) => Effect.Effect<ReadonlyArray<Repo>>
  }
>()("GitHubApi") {
  static layer = Layer.effect(
    GitHubApi,
    Effect.gen(function* () {
      const baseClient = yield* HttpClient.HttpClient
      const client = baseClient.pipe(
        HttpClient.mapRequest(HttpClientRequest.prependUrl("https://api.github.com"))
      )

      const getUser = Effect.fn("GitHubApi.getUser")(function* (username: string) {
        const response = yield* client.get(`/users/${username}`)
        return yield* HttpClientResponse.schemaBodyJson(User)(response)
      })

      const getRepo = Effect.fn("GitHubApi.getRepo")(function* (owner: string, repo: string) {
        const response = yield* client.get(`/repos/${owner}/${repo}`)
        return yield* HttpClientResponse.schemaBodyJson(Repo)(response)
      })

      const listRepos = Effect.fn("GitHubApi.listRepos")(function* (username: string) {
        const response = yield* client.get(`/users/${username}/repos`)
        return yield* HttpClientResponse.schemaBodyJson(Schema.Array(Repo))(response)
      })

      return { getUser, getRepo, listRepos }
    })
  )

  static live = GitHubApi.layer.pipe(Layer.provide(FetchHttpClient.layer))
}

// Usage
const program = Effect.gen(function* () {
  const github = yield* GitHubApi
  const user = yield* github.getUser("effect-ts")
  const repo = yield* github.getRepo("Effect-TS", "effect")
  console.log(`${user.login}: ${user.public_repos} repos`)
  console.log(`${repo.full_name}: ${repo.stargazers_count} stars`)
})

program.pipe(Effect.provide(GitHubApi.live), Effect.runPromise)
```

## Quick Reference

| Concept | API |
|---------|-----|
| Simple GET | `HttpClient.get(url)` |
| Execute request | `HttpClient.execute(request)` |
| Build request | `HttpClientRequest.get`, `.post`, `.put`, `.patch`, `.del` |
| Set headers | `HttpClientRequest.setHeader`, `.bearerToken`, `.basicAuth` |
| Query params | `HttpClientRequest.setUrlParam`, `.setUrlParams` |
| JSON body | `HttpClientRequest.schemaBodyJson(Schema)(data)` |
| Decode response | `HttpClientResponse.schemaBodyJson(Schema)(response)` |
| Status matching | `HttpClientResponse.matchStatus(response, { ... })` |
| Filter 2xx | `HttpClientResponse.filterStatusOk(response)` |
| Base URL | `HttpClient.mapRequest(HttpClientRequest.prependUrl(url))` |
| Retry transient | `HttpClient.retryTransient({ times: 3 })` |
| Provide client | `Effect.provide(FetchHttpClient.layer)` |
