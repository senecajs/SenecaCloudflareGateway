/* Copyright © 2026 Seneca Project Contributors, MIT License. */

import Cookie from 'cookie'

import { Open } from 'gubu'

type GatewayCloudflareOptions = {
  auth?: {
    token: {
      // Cookie name
      name: string
    }
    // Default cookie fields
    cookie?: any
  }
  headers: Record<string, string>
}

type GatewayCloudflareDirective = {
  // Set/remove login cookie
  auth?: {
    // Cookie token value
    token: string

    // Override option cookie fields
    cookie?: any

    // Remove auth cookie
    remove?: boolean
  }

  // HTTP redirect
  redirect?: {
    location: string
  }

  // HTTP status code
  status?: number

  // Custom headers
  headers?: Record<string, string>
}

// Not ported from gateway-azure/gateway-lambda: the legacy GET
// name/code "hook" URL convention (marked deprecated in both source
// plugins already) and the regex-based `webhooks` option — neither is
// used anywhere in this project, and Workers routes are matched by
// wrangler.toml before this handler ever runs, so there's no path
// information this handler needs beyond the message body itself.
function gateway_cloudflare(this: any, options: GatewayCloudflareOptions) {
  const seneca: any = this

  const tag = seneca.plugin.tag
  const gtag = null == tag || '-' === tag ? '' : '$' + tag
  const gateway = seneca.export('gateway' + gtag + '/handler')
  const parseJSON = seneca.export('gateway' + gtag + '/parseJSON')

  // request/ctx shape is the Cloudflare Workers fetch handler's own
  // (request: Request, env, execCtx) — see
  // https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/.
  // Unlike Azure's v3 req (plain properties, pre-parsed body) or
  // Lambda's event object, a Workers Request is the standard Fetch API
  // shape: headers is a Headers instance, the body is a stream (read via
  // request.text()/request.json()), and there's no pre-parsed req.query —
  // query params come from parsing request.url with URL.
  async function handler(
    request: Request,
    ctx: { env?: any; execCtx?: any } = {},
  ): Promise<Response> {
    const resHeaders = new Headers({
      'Content-Type': 'application/json',
      ...options.headers,
    })

    const url = new URL(request.url)
    const method = request.method

    const bodyText =
      'GET' === method || 'HEAD' === method ? '' : await request.text()
    // On malformed JSON, parseJSON returns the parse Error itself (with a
    // .handler$ property attached, not a plain {error$} object) — verified
    // against the installed @seneca/gateway source. gateway-express (the
    // one other plugin that also manually parses a raw string body via
    // this same export) doesn't special-case that result at all; it just
    // passes it straight through and lets Seneca's own action-not-found
    // path handle it. Matching that precedent rather than inventing a
    // 400 short-circuit gateway-express itself doesn't have.
    const body: any = bodyText ? parseJSON(bodyText) : {}

    const headers = Object.fromEntries(request.headers)
    const query = Object.fromEntries(url.searchParams)

    // shallow copy for better control of the body, matching
    // gateway-azure/gateway-lambda's own convention
    let json: any = { ...body }

    json.gateway = {
      // Workers routing (wrangler.toml route patterns) resolves path
      // params before this handler runs — there's no equivalent of
      // Azure's req.params/Lambda's event.pathParameters to forward.
      params: {},
      query,
      body,
      headers,
    }

    let result: any = await gateway(json, {
      req: request,
      env: ctx.env,
      execCtx: ctx.execCtx,
    })

    let status = 200

    let gateway$: GatewayCloudflareDirective = result.gateway$

    if (gateway$) {
      delete result.gateway$

      if (gateway$.auth && options.auth) {
        if (gateway$.auth.token) {
          const cookieStr = Cookie.serialize(
            options.auth.token.name,
            gateway$.auth.token,
            {
              ...options.auth.cookie,
              ...(gateway$.auth.cookie || {}),
            },
          )
          // Fetch API Headers supports multiple Set-Cookie entries
          // natively (append, not set) — a real capability plain-object
          // response shapes (Azure/Lambda) don't have.
          resHeaders.append('Set-Cookie', cookieStr)
        } else if (gateway$.auth.remove) {
          resHeaders.append(
            'Set-Cookie',
            options.auth.token.name +
              '=NONE; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT',
          )
        }
      } else if (gateway$.redirect?.location) {
        status = 302
        resHeaders.set('location', gateway$.redirect.location)
      }

      if (result.error) {
        status = gateway$.status || 500
      } else if (gateway$.status) {
        status = gateway$.status
      }

      if (gateway$.headers) {
        for (const [key, value] of Object.entries(gateway$.headers)) {
          resHeaders.set(key, value)
        }
      }
    }

    return new Response(JSON.stringify(result.out ?? {}), {
      status,
      headers: resHeaders,
    })
  }

  return {
    name: 'gateway-cloudflare',
    exports: {
      handler,
    },
  }
}

// Default options.
gateway_cloudflare.defaults = {
  auth: {
    token: {
      name: 'seneca-auth',
    },
    cookie: Open({
      httpOnly: true,
      sameSite: 'None',
      secure: true,
      path: '/',
    }),
  },
  headers: Open({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Credentials': 'true',
  }),
}

export default gateway_cloudflare

if ('undefined' !== typeof module) {
  module.exports = gateway_cloudflare
}
