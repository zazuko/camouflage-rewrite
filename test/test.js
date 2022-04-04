/* global describe it */

const assert = require('assert')
const express = require('express')
const request = require('supertest')
const rewrite = require('..')
const URL = require('url').URL

describe('camouflage-rewrite', () => {
  describe('origin', () => {
    it('should return a URL that contains protocol, host and port of the given URL with a trailing slash', () => {
      assert.equal(rewrite.origin('http://localhost/'), 'http://localhost/')
      assert.equal(rewrite.origin('https://example.org:1234/example'), 'https://example.org:1234/')
    })
  })

  describe('storeOriginal', () => {
    it('should return an object with host, forwardedHost, forwardedProto, baseUrl, originalUrl and url of the given request', () => {
      const req = {
        headers: {
          host: 'example.org',
          'x-forwarded-host': 'example.com',
          'x-forwarded-proto': 'https:'
        },
        baseUrl: '/route',
        originalUrl: '/route/path',
        url: '/path'
      }

      const original = {
        host: 'example.org',
        forwardedHost: 'example.com',
        forwardedProto: 'https:',
        baseUrl: '/route',
        originalUrl: '/route/path',
        url: '/path'
      }

      assert.deepEqual(rewrite.storeOriginal(req), original)
    })
  })

  describe('restoreOriginal', () => {
    it('should set host, baseUrl, originalUrl and url of given request based on the given object', () => {
      const req = {
        headers: {}
      }

      const original = {
        host: 'example.org',
        forwardedHost: 'example.com',
        forwardedProto: 'https:',
        baseUrl: '/route',
        originalUrl: '/route/path',
        url: '/path'
      }

      const expected = {
        headers: {
          host: 'example.org',
          'x-forwarded-host': 'example.com',
          'x-forwarded-proto': 'https:'
        },
        baseUrl: '/route',
        originalUrl: '/route/path',
        url: '/path'
      }

      rewrite.restoreOriginal(req, original)
      assert.deepEqual(req, expected)
    })

    it('should remove forwarded headers if the values are null', () => {
      const req = {
        headers: {}
      }

      const original = {
        host: 'example.org',
        forwardedHost: null,
        forwardedProto: null,
        baseUrl: '/route',
        originalUrl: '/route/path',
        url: '/path'
      }

      const expected = {
        headers: {
          host: 'example.org'
        },
        baseUrl: '/route',
        originalUrl: '/route/path',
        url: '/path'
      }

      rewrite.restoreOriginal(req, original)
      assert.deepEqual(req, expected)
    })
  })

  describe('rewrite', function () {
    it('should rewrite baseUrl and originalUrl', function () {
      const req = {
        headers: {
          host: 'example.org:1234',
          'x-forwarded-host': 'example.net',
          'x-forwarded-proto': 'https:'
        },
        baseUrl: '/route',
        originalUrl: '/route/path'
      }

      const options = {
        urlParts: new URL('http://example.com:4321/base/')
      }

      const expected = {
        headers: {
          host: 'example.com:4321',
          'x-forwarded-host': 'example.com:4321',
          'x-forwarded-proto': 'http:'
        },
        baseUrl: '/base/route',
        originalUrl: '/base/route/path'
      }

      rewrite.rewrite(options, req)
      assert.deepEqual(req, expected)
    })

    it('should rewrite https URLs', function () {
      const req = {
        headers: {
          host: 'example.org:1234',
          'x-forwarded-host': 'example.net',
          'x-forwarded-proto': 'https:'
        },
        baseUrl: '/route',
        originalUrl: '/route/path'
      }

      const options = {
        urlParts: new URL('https://example.com:4321/base/')
      }

      const expected = {
        headers: {
          host: 'example.com:4321',
          'x-forwarded-host': 'example.com:4321',
          'x-forwarded-proto': 'https:'
        },
        baseUrl: '/base/route',
        originalUrl: '/base/route/path'
      }

      rewrite.rewrite(options, req)
      assert.deepEqual(req, expected)
    })
  })

  describe('middleware', function () {
    it('should bypass request if no options are given', function (done) {
      const app = express()

      app.use(function (req, res, next) {
        rewrite.middleware(null, req, res, next)
      })

      app.use(function (req, res) {
        res.json({
          host: req.headers.host,
          path: req.originalUrl
        })
      })

      request(app)
        .get('/path')
        .set('host', 'example.org')
        .expect(200, {
          host: 'example.org',
          path: '/path'
        }, done)
    })

    it('should bypass request if no URL is given', function (done) {
      const app = express()

      app.use(function (req, res, next) {
        rewrite.middleware({}, req, res, next)
      })

      app.use(function (req, res) {
        res.json({
          host: req.headers.host,
          path: req.originalUrl
        })
      })

      request(app)
        .get('/path')
        .set('host', 'example.org')
        .expect(200, {
          host: 'example.org',
          path: '/path'
        }, done)
    })

    it('should bypass request if media type is not in list', function (done) {
      const app = express()

      app.use(function (req, res, next) {
        rewrite.middleware({
          mediaTypes: ['text/html'],
          urlParts: new URL('http://example.com/base/')
        }, req, res, next)
      })

      app.use(function (req, res) {
        res.json({
          host: req.headers.host,
          path: req.originalUrl
        })
      })

      request(app)
        .get('/path')
        .set('host', 'example.org')
        .set('accept', 'application/json')
        .expect(200, {
          host: 'example.org',
          path: '/path'
        }, done)
    })

    it('should handle request if no media type is given', function (done) {
      const app = express()

      app.use(function (req, res, next) {
        rewrite.middleware({
          url: 'http://example.com/base/',
          urlParts: new URL('http://example.com/base/')
        }, req, res, next)
      })

      app.use(function (req, res) {
        res.json({
          host: req.headers.host,
          path: req.originalUrl
        })
      })

      request(app)
        .get('/path')
        .set('host', 'example.org')
        .set('accept', 'application/json')
        .expect(200, {
          host: 'example.com',
          path: '/base/path'
        }, done)
    })

    it('should handle request if media type is in given list', function (done) {
      const app = express()

      app.use(function (req, res, next) {
        rewrite.middleware({
          mediaTypes: ['application/json'],
          url: 'http://example.com/base/',
          urlParts: new URL('http://example.com/base/')
        }, req, res, next)
      })

      app.use(function (req, res) {
        res.json({
          host: req.headers.host,
          path: req.originalUrl
        })
      })

      request(app)
        .get('/path')
        .set('host', 'example.org')
        .set('accept', 'application/json')
        .expect(200, {
          host: 'example.com',
          path: '/base/path'
        }, done)
    })

    it('should not touch content of rewriteContent is false', (done) => {
      const app = express()

      app.use((req, res, next) => {
        rewrite.middleware({
          urlParts: new URL('http://example.com/base/')
        }, req, res, next)
      })

      app.use((_req, res) => {
        res.end('http://example.com/base/path')
      })

      request(app)
        .get('/path')
        .set('host', 'example.org')
        .expect(200, 'http://example.com/base/path', done)
    })

    it('should rewrite content if rewriteContent is true', (done) => {
      const app = express()

      app.use((req, res, next) => {
        rewrite.middleware({
          rewriteContent: true,
          url: 'http://example.com/base/',
          urlParts: new URL('http://example.com/base/')
        }, req, res, next)
      })

      app.use((_req, res) => {
        res.end('http://example.com/base/path')
      })

      request(app)
        .get('/path')
        .set('host', 'example.org')
        .expect(200, 'http://example.org/path', done)
    })

    it('should rewrite headers if rewriteHeaders is true', async () => {
      const app = express()

      app.use((req, res, next) => {
        rewrite.middleware({
          rewriteHeaders: true,
          url: 'http://example.com/base/',
          urlParts: new URL('http://example.com/base/')
        }, req, res, next)
      })

      app.use((_req, res) => {
        res.links({
          'http://www.w3.org/ns/json-ld#context': 'http://example.com/base/context'
        })

        res.end('http://example.com/base/path')
      })

      const res2 = await request(app)
        .get('/path')
        .set('host', 'example.org')
      assert.notEqual(res2.get('link').indexOf('http://example.org/'), -1)
    })
  })

  describe('factory', () => {
    it('should build a middleware which handles options = null', function (done) {
      const app = express()

      app.use(rewrite())

      app.use((_req, res) => {
        res.end('http://example.com/base/path')
      })

      request(app)
        .get('/path')
        .set('host', 'example.org')
        .expect(200, 'http://example.com/base/path', done)
    })

    it('should build the middleware and parse the URL into URL parts', (done) => {
      const app = express()

      app.use(rewrite({
        rewriteContent: true,
        url: 'http://example.com/base/'
      }))

      app.use((_req, res) => {
        res.end('http://example.com/base/path')
      })

      request(app)
        .get('/path')
        .set('host', 'example.org')
        .expect(200, 'http://example.org/path', done)
    })
  })
})
