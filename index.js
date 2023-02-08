'use strict'

const absoluteUrl = require('absolute-url')
const hijackResponse = require('hijackresponse')
const URL = require('url').URL
const path = require('path')
const replace = require('string-replace-stream')

const origin = (iri) => {
  const parts = new URL(iri)
  parts.pathname = '/'
  parts.search = ''
  parts.username = ''
  parts.password = ''

  return parts.toString()
}

const storeOriginal = (req) => ({
  host: req.headers.host,
  forwardedHost: req.headers['x-forwarded-host'],
  forwardedProto: req.headers['x-forwarded-proto'],
  baseUrl: req.baseUrl,
  originalUrl: req.originalUrl,
  url: req.url
})

const restoreOriginal = (req, original) => {
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

const rewrite = (options, req) => {
  req.headers.host = options.urlParts.host
  req.headers['x-forwarded-host'] = options.urlParts.host
  req.headers['x-forwarded-proto'] = options.urlParts.protocol
  req.baseUrl = path.join(options.urlParts.pathname, req.baseUrl)
  req.originalUrl = path.join(options.urlParts.pathname, req.originalUrl)
}

const middleware = (options, req, res, next) => {
  // do nothing if there are no options
  if (!options || !options.url) {
    return next()
  }

  // only process configured media types
  if (options.mediaTypes) {
    const matches = options.mediaTypes.filter((mediaType) => {
      return req.accepts(mediaType)
    })

    if (matches.length === 0) {
      return next()
    }
  }

  const ignorePattern = options.ignore && new RegExp(options.ignore)

  // store original request parameters
  const original = storeOriginal(req)

  // allow other middlewares to access the original address (by using `res.locals.camouflageRewriteOriginalUrl`)
  absoluteUrl.attach(req)
  const originalUrl = new URL(req.absoluteUrl())
  originalUrl.search = ''
  res.locals.camouflageRewriteOriginalUrl = originalUrl.toString()

  // rewrite request parameters
  rewrite(options, req)

  hijackResponse(res, (err, res) => {
    if (err) {
      res.unhijack()

      return next(err)
    }

    // restore original request parameters
    restoreOriginal(req, original)

    absoluteUrl.attach(req)

    const url = req.absoluteUrl()

    if (ignorePattern && ignorePattern.test(url)) {
      return res.pipe(res)
    }

    // replace url with origin (protocol + host + '/')
    const requestOrigin = origin(url)

    if (options.rewriteHeaders) {
      Object.keys(res.getHeaders()).forEach((field) => {
        res.header(field, res.getHeaders()[field].toString().split(options.url).join(requestOrigin))
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

const factory = (options) => {
  if (options && options.url) {
    options.urlParts = new URL(options.url)
  }

  return middleware.bind(null, options)
}

factory.origin = origin
factory.storeOriginal = storeOriginal
factory.restoreOriginal = restoreOriginal
factory.rewrite = rewrite
factory.middleware = middleware

module.exports = factory
