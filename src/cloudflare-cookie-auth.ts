/* Copyright © 2026 Seneca Project Contributors, MIT License. */

import Cookie from 'cookie'

// @seneca/gateway-auth's cookie specs (azure_cookie, lambda_cookie,
// express_cookie) are hardcoded by name inside that package — there's no
// pluggable interface for adding a new one without forking it (verified
// by reading its full source: prepareSpec is a literal lookup object).
// This replicates the exact same hook-registration pattern those specs
// use (sys:gateway,add:hook,hook:custom / hook:action, tagged
// gateway:'cloudflare') directly in project code instead, calling the
// same underlying sys:user,auth:user pin. A patch upstreaming a real
// cloudflare_cookie spec into @seneca/gateway-auth itself is intended
// for later — this is the near-term equivalent, not a permanent fork.
//
// Call this directly (not via `.use('gateway-auth', {spec:{cloudflare_cookie:...}})`,
// since that spec name doesn't exist) after loading gateway-cloudflare:
//
//   seneca.use('gateway-cloudflare', {...})
//   await prepareCloudflareCookieAuth(seneca, {
//     token: { name: 'my-auth-cookie' },
//     user: { auth: true, require: false },
//   })
export type CloudflareCookieAuthSpec = {
  token: { name: string }
  user: { auth?: boolean; require?: boolean }
}

export async function prepareCloudflareCookieAuth(
  seneca: any,
  spec: CloudflareCookieAuthSpec,
): Promise<void> {
  const root = seneca.root
  const cookieName = spec.token.name

  if (spec.user.auth) {
    seneca.act('sys:gateway,add:hook,hook:custom', {
      gateway: 'cloudflare',
      tag: seneca.plugin?.tag,
      action: async function cloudflareCookieAuth(
        custom: any,
        _json: any,
        ctx: any,
      ) {
        // ctx.req is the Fetch API Request handed through by
        // gateway-cloudflare's handler(request, ctx) — headers is a
        // Headers instance, not a plain object like Azure's req.headers.
        const cookieStr: string | null = ctx.req?.headers?.get('cookie')

        if (null != cookieStr && 0 < cookieStr.length) {
          const cookies = Cookie.parse(cookieStr)
          const token = cookies[cookieName]

          const authres = await root.post('sys:user,auth:user', { token })

          if (authres.ok) {
            extendPrincipal(custom, 'user', authres.user)
            extendPrincipal(custom, 'login', authres.login)
          }
        }
      },
    })
  }

  if (spec.user.require) {
    seneca.act('sys:gateway,add:hook,hook:action', {
      gateway: 'cloudflare',
      tag: seneca.plugin?.tag,
      action: async function cloudflareCookieRequire(this: any) {
        const seneca: any = this
        const user = seneca?.fixedmeta?.custom?.principal?.user

        if (null == user) {
          return {
            out: { ok: false, why: 'no-user' },
            gateway$: { status: 401 },
          }
        }
      },
    })
  }
}

function extendPrincipal(custom: any, key: string, val: any) {
  const principal = (custom.principal = custom.principal || {})
  principal[key] = val
  return principal
}
