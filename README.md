# camouflage-rewrite

Express middleware to rewrite a request to a different URL and optional also replace it in the response content.
This middleware replaces the `Host` header field and the requested `path` with given URL.
All middlewares used after the rewrite middleware will see the patched header field in `req.headers` and the patched path in `baseUrl` and `originalUrl`.
Optional it's also possible to rewrite the response content.
The `res` object is hijacked to pipe the response stream through a string replacement transform.
No code changes in the other middlewares or handlers are required.

## Usage

The module returns a function to build a middleware.
The function must be called with a single options object.
The following options are supported:

- mediaTypes: An array of media types which will be processed.
  The `Accept` header field is used for the test. (optional)
- rewriteContent: If it's set to true the response content will be also rewritten.
- url: The internal/camouflage URL which will replace the request URL.

## Example

```
// load the module
var rewrite = require('camouflage-rewrite')

// add the routing
app.use(rewrite({
  rewriteContent: true,
  url: 'http://example.com/base/'
})

app.use(function (req, res) {
  // internal the variables will have the following values:
  console.log(req.headers.host) // example.com
  console.log(req.baseUrl) // /base

  // the response to 'http://example.org/path' will be patched like this
  res.end('http://example.com/base/path') // http://example.org/path
})
```
