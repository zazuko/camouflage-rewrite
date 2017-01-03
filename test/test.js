/* global describe it */

var assert = require('assert')
var express = require('express')
var request = require('supertest')
var rewrite = require('..')
var url = require('url')

describe('camouflage-rewrite', function () {
  describe('origin', function () {
    it('should return a URL that contains protocol, host and port of the given URL with a trailing slash', function () {
      assert.equal(rewrite.origin('http://localhost/'), 'http://localhost/')
      assert.equal(rewrite.origin('https://example.org:1234/example'), 'https://example.org:1234/')
    })
  })

  describe('storeOriginal', function () {
    it('should return an object with host, forwardedHost, forwardedProto, baseUrl, originalUrl and url of the given request', function () {
      var req = {
        headers: {
          host: 'example.org',
          'x-forwarded-host': 'example.com',
          'x-forwarded-proto': 'https:'
        },
        baseUrl: '/route',
        originalUrl: '/route/path',
        url: '/path'
      }

      var original = {
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

  describe('restoreOriginal', function () {
    it('should set host, baseUrl, originalUrl and url of given request based on the given object', function () {
      var req = {
        headers: {}
      }

      var original = {
        host: 'example.org',
        forwardedHost: 'example.com',
        forwardedProto: 'https:',
        baseUrl: '/route',
        originalUrl: '/route/path',
        url: '/path'
      }

      var expected = {
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

    it('should remove forwarded headers if the values are null', function () {
      var req = {
        headers: {}
      }

      var original = {
        host: 'example.org',
        forwardedHost: null,
        forwardedProto: null,
        baseUrl: '/route',
        originalUrl: '/route/path',
        url: '/path'
      }

      var expected = {
        headers: {
          host: 'example.org',
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
      var req = {
        headers: {
          host: 'example.org:1234',
          'x-forwarded-host': 'example.net',
          'x-forwarded-proto': 'https:'
        },
        baseUrl: '/route',
        originalUrl: '/route/path'
      }

      var options = {
        urlParts: url.parse('http://example.com:4321/base/')
      }

      var expected = {
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
      var req = {
        headers: {
          host: 'example.org:1234',
          'x-forwarded-host': 'example.net',
          'x-forwarded-proto': 'https:'
        },
        baseUrl: '/route',
        originalUrl: '/route/path'
      }

      var options = {
        urlParts: url.parse('https://example.com:4321/base/')
      }

      var expected = {
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
      var app = express()

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
      var app = express()

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
      var app = express()

      app.use(function (req, res, next) {
        rewrite.middleware({
          mediaTypes: ['text/html'],
          urlParts: url.parse('http://example.com/base/')
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
      var app = express()

      app.use(function (req, res, next) {
        rewrite.middleware({
          url: 'http://example.com/base/',
          urlParts: url.parse('http://example.com/base/')
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
      var app = express()

      app.use(function (req, res, next) {
        rewrite.middleware({
          mediaTypes: ['application/json'],
          url: 'http://example.com/base/',
          urlParts: url.parse('http://example.com/base/')
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

    it('should not touch content of rewriteContent is false', function (done) {
      var app = express()

      app.use(function (req, res, next) {
        rewrite.middleware({
          urlParts: url.parse('http://example.com/base/')
        }, req, res, next)
      })

      app.use(function (req, res) {
        res.end('http://example.com/base/path')
      })

      request(app)
        .get('/path')
        .set('host', 'example.org')
        .expect(200, 'http://example.com/base/path', done)
    })

    it('should rewrite content if rewriteContent is true', function (done) {
      var app = express()

      app.use(function (req, res, next) {
        rewrite.middleware({
          rewriteContent: true,
          url: 'http://example.com/base/',
          urlParts: url.parse('http://example.com/base/')
        }, req, res, next)
      })

      app.use(function (req, res) {
        res.end('http://example.com/base/path')
      })

      request(app)
        .get('/path')
        .set('host', 'example.org')
        .expect(200, 'http://example.org/path', done)
    })
  })

  describe('factory', function () {
    it('should build a middleware which handles options = null', function (done) {
      var app = express()

      app.use(rewrite())

      app.use(function (req, res) {
        res.end('http://example.com/base/path')
      })

      request(app)
        .get('/path')
        .set('host', 'example.org')
        .expect(200, 'http://example.com/base/path', done)
    })

    it('should build the middleware and parse the URL into URL parts', function (done) {
      var app = express()

      app.use(rewrite({
        rewriteContent: true,
        url: 'http://example.com/base/'
      }))

      app.use(function (req, res) {
        res.end('http://example.com/base/path')
      })

      request(app)
        .get('/path')
        .set('host', 'example.org')
        .expect(200, 'http://example.org/path', done)
    })
  })
})
