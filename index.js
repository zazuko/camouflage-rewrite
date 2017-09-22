'use strict'

var absoluteUrl = require('absolute-url')
var hijackResponse = require('hijackresponse')
var path = require('path')
var replace = require('string-replace-stream')
var url = require('url')

function origin (iri) {
  var parts = url.parse(iri)

  return url.format({
    protocol: parts.protocol,
    host: parts.host,
    pathname: '/'
  })
}

function storeOriginal (req) {
  return {
    host: req.headers.host,
    forwardedHost: req.headers['x-forwarded-host'],
    forwardedProto: req.headers['x-forwarded-proto'],
    baseUrl: req.baseUrl,
    originalUrl: req.originalUrl,
    url: req.url
  }
}

function restoreOriginal (req, original) {
  req.headers.host = original.host

  if (original.forwardedHost) {
    req.headers['x-forwarded-host'] = original.forwardedHost
  } else {
    delete req.headers['x-forwarded-host']
  }

  if (original.forwardedProto) {
    req.headers['x-forwarded-proto'] = original.forwardedProto
  } else {
    delete req.headers['x-forwarded-proto']
  }

  req.baseUrl = original.baseUrl
  req.originalUrl = original.originalUrl
  req.url = original.url
}

function rewrite (options, req) {
  req.headers.host = options.urlParts.host
  req.headers['x-forwarded-host'] = options.urlParts.host
  req.headers['x-forwarded-proto'] = options.urlParts.protocol
  req.baseUrl = path.join(options.urlParts.pathname, req.baseUrl)
  req.originalUrl = path.join(options.urlParts.pathname, req.originalUrl)
}

function middleware (options, req, res, next) {
  // do nothing if there are no options
  if (!options || !options.url) {
    return next()
  }

  // only process configured media types
  if (options.mediaTypes) {
    var matches = options.mediaTypes.filter(function (mediaType) {
      return req.accepts(mediaType)
    })

    if (matches.length === 0) {
      return next()
    }
  }

  // store original request parameters
  var original = storeOriginal(req)

  // rewrite request parameters
  rewrite(options, req)

  hijackResponse(res, function (err, res) {
    if (err) {
      res.unhijack()

      return next(err)
    }

    // restore original request parameters
    restoreOriginal(req, original)

    absoluteUrl.attach(req)

    // replace url with origin (protocol + host + '/')
    var requestOrigin = origin(req.absoluteUrl())

    if (options.rewriteHeaders) {
      Object.keys(res._headers).forEach(function (field) {
        res._headers[field] = res._headers[field].split(options.url).join(requestOrigin)
      })
    }

    if (options.rewriteContent) {
      res.removeHeader('content-length')

      res.pipe(replace(options.url, requestOrigin)).pipe(res)
    } else {
      res.pipe(res)
    }
  })

  next()
}

function factory (options) {
  if (options && options.url) {
    options.urlParts = url.parse(options.url)
  }

  return middleware.bind(null, options)
}

factory.origin = origin
factory.storeOriginal = storeOriginal
factory.restoreOriginal = restoreOriginal
factory.rewrite = rewrite
factory.middleware = middleware

module.exports = factory
