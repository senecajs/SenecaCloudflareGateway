# Changes

## 0.1.0 2026-11-21

* First release. Handles Seneca gateway messages inside a Cloudflare Workers fetch handler, with a cookie authentication helper.
* Seneca 4: the peer dependency is `seneca` `^4.0.0`, and `@seneca/gateway` `^2.0.0`, its Seneca 4 release. Node.js 24 or later (`engines.node` `>=24`).
* The option defaults are built with the validator that Seneca passes to the plugin: `defaults` is a function of `{ valid }`. Seneca 4 rejects defaults built with Gubu (`plugin_gubu_shape`), and gubu was never a declared dependency. `auth.cookie` and `headers` are open, so they accept keys that the defaults do not name, such as a cookie `domain`. Unknown keys in `auth` and `auth.token` are rejected with `invalid_plugin_option`.
* No dependency on `seneca-promisify`: Seneca 4 has promises built in.
* The runtime dependency `cookie` is `^0.7.2`, for the advisory GHSA-pxg6-pf52-xh8x.
* Releases are published from GitHub Actions with npm trusted publishing and provenance. The local `repo-tag` and `repo-publish` scripts are removed.
* Tested offline only, with Node's native `Request` and `Response`. Running inside a deployed Cloudflare Worker was not tested on Seneca 4.
