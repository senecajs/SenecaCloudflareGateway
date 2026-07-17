/* Copyright © 2026 Seneca Project Contributors, MIT License. */

import Seneca from 'seneca'

import GatewayCloudflare from '../src/gateway-cloudflare'
import { prepareCloudflareCookieAuth } from '../src/cloudflare-cookie-auth'

function makeSeneca() {
  return Seneca({ legacy: false })
    .test()
    .use('promisify')
    .use('gateway', { allow: { 'role:test,cmd:ping': true } })
    .use(GatewayCloudflare, {})
}

describe('gateway-cloudflare', () => {
  test('load-plugin', async () => {
    expect(GatewayCloudflare).toBeDefined()

    const seneca = makeSeneca()
    await seneca.ready()

    expect(seneca.export('gateway-cloudflare/handler')).toBeDefined()
  })

  test('handles a JSON POST and returns the action result', async () => {
    const seneca = makeSeneca()

    seneca.add('role:test,cmd:ping', function (this: any, _msg: any, reply: any) {
      reply(null, { ok: true, pong: true })
    })

    await seneca.ready()

    const handler = seneca.export('gateway-cloudflare/handler')
    const request = new Request('https://worker.test/api/public/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'test', cmd: 'ping' }),
    })

    const response = await handler(request, {})
    expect(response.status).toEqual(200)

    const body = await response.json()
    expect(body).toMatchObject({ ok: true, pong: true })
  })

  test('rejects a pin not on the allow list', async () => {
    const seneca = makeSeneca()

    seneca.add('role:test,cmd:notallowed', function (this: any, _msg: any, reply: any) {
      reply(null, { ok: true })
    })

    await seneca.ready()

    const handler = seneca.export('gateway-cloudflare/handler')
    const request = new Request('https://worker.test/api/public/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'test', cmd: 'notallowed' }),
    })

    const response = await handler(request, {})
    const body = await response.json()
    expect(body.code).toEqual('not-allowed')
  })

  test('malformed JSON body does not crash the handler', async () => {
    // Matches gateway-express's own precedent: parseJSON's Error result
    // is passed straight through to the core gateway handler rather than
    // short-circuited into a deliberate 400 (neither this plugin nor
    // gateway-express invents that check) — the request pattern-matches
    // to nothing, so this exercises the same 'not-allowed'/not-found path
    // as any other unrecognized message, not a parse-specific error path.
    const seneca = makeSeneca()
    await seneca.ready()

    const handler = seneca.export('gateway-cloudflare/handler')
    const request = new Request('https://worker.test/api/public/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not valid json',
    })

    const response = await handler(request, {})
    expect(response.status).toBeDefined()

    const body = await response.json()
    expect(body).toBeDefined()
  })

  test('GET/HEAD requests skip body parsing', async () => {
    const seneca = makeSeneca()

    seneca.add('role:test,cmd:ping', function (this: any, _msg: any, reply: any) {
      reply(null, { ok: true })
    })

    await seneca.ready()

    const handler = seneca.export('gateway-cloudflare/handler')
    const request = new Request(
      'https://worker.test/api/public/test?role=test&cmd=ping',
      { method: 'GET' },
    )

    // No allow entry for a bare GET with query-derived pin — this just
    // proves the handler doesn't throw trying to read a GET body.
    const response = await handler(request, {})
    expect(response.status).toBeDefined()
  })

  test('sets a login cookie via the auth gateway$ directive', async () => {
    const seneca = Seneca({ legacy: false })
      .test()
      .use('promisify')
      .use('gateway', { allow: { 'role:test,cmd:login': true } })
      .use(GatewayCloudflare, {})

    seneca.add(
      'role:test,cmd:login',
      function (this: any, _msg: any, reply: any) {
        reply(null, {
          out: { ok: true },
          gateway$: { auth: { token: 'tok-abc' } },
        })
      },
    )

    await seneca.ready()

    const handler = seneca.export('gateway-cloudflare/handler')
    const request = new Request('https://worker.test/api/public/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'test', cmd: 'login' }),
    })

    const response = await handler(request, {})
    const setCookie = response.headers.get('set-cookie')
    expect(setCookie).toContain('seneca-auth=tok-abc')
  })

  describe('prepareCloudflareCookieAuth', () => {
    async function makeAuthedSeneca(userForToken: any) {
      const seneca = Seneca({ legacy: false })
        .test()
        .use('promisify')
        .use('gateway', {
          allow: { 'role:test,cmd:whoami': true, 'role:test,cmd:secure': true },
        })
        .use(GatewayCloudflare, {})

      // Stand-in for @seneca/user's sys:user,auth:user pin.
      seneca.add(
        'sys:user,auth:user',
        function (this: any, msg: any, reply: any) {
          if ('good-token' === msg.token) {
            reply(null, { ok: true, user: userForToken, login: { id: 'l0' } })
          } else {
            reply(null, { ok: false })
          }
        },
      )

      seneca.add(
        'role:test,cmd:whoami',
        function (this: any, _msg: any, reply: any) {
          const user = this.fixedmeta?.custom?.principal?.user
          reply(null, { ok: true, user: user || null })
        },
      )

      seneca.add(
        'role:test,cmd:secure',
        function (this: any, _msg: any, reply: any) {
          reply(null, { ok: true, secure: true })
        },
      )

      await prepareCloudflareCookieAuth(seneca, {
        token: { name: 'seneca-auth' },
        user: { auth: true, require: false },
      })

      await seneca.ready()
      return seneca
    }

    test('extends the principal when a valid cookie is present', async () => {
      const seneca = await makeAuthedSeneca({ id: 'u0', email: 'a@b.test' })
      const handler = seneca.export('gateway-cloudflare/handler')

      const request = new Request('https://worker.test/api/private/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'seneca-auth=good-token',
        },
        body: JSON.stringify({ role: 'test', cmd: 'whoami' }),
      })

      const response = await handler(request, {})
      const body = await response.json()
      expect(body.user).toMatchObject({ id: 'u0', email: 'a@b.test' })
    })

    test('no principal when the cookie is missing', async () => {
      const seneca = await makeAuthedSeneca({ id: 'u0' })
      const handler = seneca.export('gateway-cloudflare/handler')

      const request = new Request('https://worker.test/api/private/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'test', cmd: 'whoami' }),
      })

      const response = await handler(request, {})
      const body = await response.json()
      expect(body.user).toBeNull()
    })

    test('user.require blocks the action with 401 when no principal', async () => {
      const seneca = Seneca({ legacy: false })
        .test()
        .use('promisify')
        .use('gateway', { allow: { 'role:test,cmd:secure': true } })
        .use(GatewayCloudflare, {})

      seneca.add(
        'sys:user,auth:user',
        function (this: any, _msg: any, reply: any) {
          reply(null, { ok: false })
        },
      )

      seneca.add(
        'role:test,cmd:secure',
        function (this: any, _msg: any, reply: any) {
          reply(null, { ok: true, secure: true })
        },
      )

      await prepareCloudflareCookieAuth(seneca, {
        token: { name: 'seneca-auth' },
        user: { auth: true, require: true },
      })

      await seneca.ready()

      const handler = seneca.export('gateway-cloudflare/handler')
      const request = new Request('https://worker.test/api/private/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'test', cmd: 'secure' }),
      })

      const response = await handler(request, {})
      expect(response.status).toEqual(401)

      const body = await response.json()
      expect(body).toMatchObject({ ok: false, why: 'no-user' })
    })
  })
})
