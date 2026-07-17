![Seneca](http://senecajs.org/files/assets/seneca-logo.png)
> A [Seneca.js][] gateway plugin.

# @seneca/gateway-cloudflare

| ![Voxgig](https://www.voxgig.com/res/img/vgt01r.png) | This open source module is sponsored and supported by [Voxgig](https://www.voxgig.com). |
|---|---|

## Description

Handles incoming messages within [Cloudflare Workers][], the same role
[`@seneca/gateway-azure`][] and [`@seneca/gateway-lambda`][] play for
Azure Functions and AWS Lambda. Adapts a Workers `fetch` handler's
Fetch API `Request`/`Response` to [`@seneca/gateway`][]'s
transport-agnostic core `handler(json, ctx)` contract.

Also ships `prepareCloudflareCookieAuth`, a standalone helper that
replicates [`@seneca/gateway-auth`][]'s `azure_cookie`/`lambda_cookie`
hook-registration pattern directly — that package's cookie specs are
hardcoded by name with no pluggable interface, so a `cloudflare_cookie`
spec can't be added without forking it. This is the near-term
workaround; an upstream patch adding a real `cloudflare_cookie` spec to
`@seneca/gateway-auth` is intended for later.

## Install

```sh
npm install seneca
npm install @seneca/gateway
npm install @seneca/gateway-cloudflare
```

## Quick Example

```ts
// src/index.ts — a Cloudflare Worker
import Seneca from 'seneca'
import GatewayCloudflare from '@seneca/gateway-cloudflare'
import { prepareCloudflareCookieAuth } from '@seneca/gateway-cloudflare'

const seneca = Seneca()
  .use('promisify')
  .use('gateway', { allow: { 'role:auth,cmd:signin': true } })
  .use(GatewayCloudflare, {
    auth: { token: { name: 'my-session' } },
  })

await prepareCloudflareCookieAuth(seneca, {
  token: { name: 'my-session' },
  user: { auth: true, require: false },
})

seneca.add('role:auth,cmd:signin', function (msg, reply) {
  reply(null, { ok: true, gateway$: { auth: { token: 'a-session-token' } } })
})

await seneca.ready()

export default {
  async fetch(request: Request, env: any, ctx: any) {
    const handler = seneca.export('gateway-cloudflare/handler')
    return handler(request, { env, execCtx: ctx })
  },
}
```

## Status

Early (`v0.0.1`) — built for [night-sky-logbook][]'s Cloudflare deploy
target. The `handler` adapter itself is unit-tested against Node's
native `Request`/`Response` (no Miniflare needed for that). Whether
Seneca's own plugin-loading mechanism (`use-plugin`, which relies on a
live runtime `require()`) works inside a real deployed Worker is a
separate, open question — see night-sky-logbook's own notes on this.

## Code examples

For more examples, see the [tests][].

### Seneca compatibility

Supports Seneca versions **3.x** and above.

[Seneca.js]: https://www.npmjs.com/package/seneca
[Cloudflare Workers]: https://developers.cloudflare.com/workers/
[`@seneca/gateway`]: https://www.npmjs.com/package/@seneca/gateway
[`@seneca/gateway-azure`]: https://www.npmjs.com/package/@seneca/gateway-azure
[`@seneca/gateway-lambda`]: https://www.npmjs.com/package/@seneca/gateway-lambda
[`@seneca/gateway-auth`]: https://www.npmjs.com/package/@seneca/gateway-auth
[night-sky-logbook]: https://github.com/senecajs
[tests]: ./test/gateway-cloudflare.test.ts
