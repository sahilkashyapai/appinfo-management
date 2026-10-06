// Express 4 doesn't catch errors from async route handlers: a rejected promise
// skips errorHandler entirely, the request hangs, and Node then exits on the
// unhandled rejection — taking the whole server down. This patches Express's
// route layer once so a handler's rejected promise is passed to next(err) and
// reaches errorHandler like a synchronous throw. (Same approach as the
// express-async-errors package; Express 5 does this natively.)
const Layer = require('express/lib/router/layer');

const original = Layer.prototype.handle_request;

if (!original.__asyncErrorsPatched) {
  Layer.prototype.handle_request = function handleRequest(req, res, next) {
    const fn = this.handle;
    if (fn.length > 3) return original.call(this, req, res, next); // error middleware: leave as is
    try {
      const result = fn(req, res, next);
      if (result && typeof result.catch === 'function') result.catch(next);
    } catch (err) {
      next(err);
    }
    return undefined;
  };
  Layer.prototype.handle_request.__asyncErrorsPatched = true;
}
