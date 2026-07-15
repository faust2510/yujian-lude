import assert from 'node:assert/strict'
import test from 'node:test'

import config from '../../vite.config.js'

function mountMiddleware(hook) {
  const middleware = []
  hook({ middlewares: { use: handler => middleware.push(handler) } })
  assert.equal(middleware.length, 1)
  return middleware[0]
}

function runMiddleware(middleware, url) {
  let nextCalled = false
  const response = {
    headers: {},
    ended: false,
    setHeader(name, value) { this.headers[name] = value },
    end() { this.ended = true },
  }
  middleware({ url }, response, () => { nextCalled = true })
  return { response, nextCalled }
}

test('Vite redirects the app base without a trailing slash in dev and preview', () => {
  const plugin = config.plugins.find(item => item?.name === 'meet-ruth-app-base-redirect')
  assert.ok(plugin, 'app base redirect plugin should be configured')

  for (const hook of [plugin.configureServer, plugin.configurePreviewServer]) {
    const middleware = mountMiddleware(hook)
    const { response, nextCalled } = runMiddleware(middleware, '/app?from=direct')
    assert.equal(response.statusCode, 308)
    assert.equal(response.headers.Location, '/app/?from=direct')
    assert.equal(response.ended, true)
    assert.equal(nextCalled, false)
  }
})

test('Vite app base redirect leaves other routes untouched', () => {
  const plugin = config.plugins.find(item => item?.name === 'meet-ruth-app-base-redirect')
  assert.ok(plugin, 'app base redirect plugin should be configured')
  const middleware = mountMiddleware(plugin.configureServer)

  for (const url of ['/app/', '/app/login', '/api/health']) {
    const { response, nextCalled } = runMiddleware(middleware, url)
    assert.equal(nextCalled, true)
    assert.equal(response.ended, false)
  }
})
