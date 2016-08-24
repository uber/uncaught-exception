# uncaught-exception

Handle uncaught exceptions.

Supports 0.10 only. Designed for robustness and garaunteed
    eventual termination of the process.

## Example

```js
var uncaughtHandler = require('uncaught-exception');

var myLogger = {
    fatal: function fatal(message, metaObj, callback) {
        // must call the callback once logged
    }
}
var myStatsd = {
    immediateIncrement: function inc(key, count, callback) {
        // call the callback once incremented.
    }
}

var onError = uncaughtHandler({
    logger: myLogger,
    statsd: myStatsd,
    meta: { 'hostname': require('os').hostname() },
    abortOnUncaught: true, // opt into aborting on uncaught
    backupFile: '/path/to/uncaught-handler.log',
    gracefulShutdown: function (callback) {
        // perform some graceful shutdown here.

        // for example synchronize state of your app to redis
        // for example communicate to master process in cluster
        // and ask for a new worker to be started

        // must call callback once gracefully shutdown
        // after you call the callback the process will shutdown
    }
})

process.on('uncaughtException', onError)
```

## Recommended best practices

For node0.10 and critical services we recommend that you:

 - Use a `statsd` and set up alerts & metrics on "uncaught exceptions"
 - Use a `logger` and pay attention to any "fatal" logs
 - Use a `backupFile`, this is gold if your logger has an internal
    uncaught exception or bug.
 - Set `abortOnUncaught` to false. Uncaught exceptions are bad but
    no availability is worse, where possible you want to avoid the
    absolute worse case of "spin crashing" and continue on exceptions
    for partial availability, even if that means data corruption.

### Continueing on exceptions is bad

Generally the nodejs documentation recommends against continuing in
an undefined state as it can cause cascading failures.

This is completely correct, however having the system restart itself
in an automatic fashion causes a different failure mode that's worse.
Generally partial availability trumps all.

However, uncaught exceptions are serious. You should page the oncall,
even in the middle of the night. The on call is responsible for taking
an action whether that's mitigation, failover or restarting the worker.
However the on call must ALWAYS restart the worker.

### Implementing an abort trap

If you want to partially automate the restarting of workers then I
would recommend you implement something like:

 - Have your application start in `ABORT` mode, where `abortOnUncaught`
    is true.
 - Once it aborts, have the parent or the supervisor recognise that
    it has crashed and will remember to start the application in `NOT_ABORT`
    mode for the next 24 hours

By implementing an improved supervisor you can "throttle" the amount of
process aborts that happen, this allows a single restart in the common
case without manual intervention and maintains partial availability during
a "spin crash" or "high volume uncaught" scenario.

### How to use the `gracefulShutdown` handler

The `gracefulShutdown` handler is really a pre-abort asynchronous
hook used to co-ordinate with your routing infrastructure, for
example you may want HAProxy to remove you from the pool or you
may want to more gently leave a `ringpop` instance.

## Docs

### Type definitions

See [docs.mli for type definitions](docs.mli)

### `var onError = uncaughtHandler(options)`

```js
uncaught-exception/uncaught := (options: {
    logger: {
        fatal: (String, Object, Callback) => void
    },
    statsd: {
        immediateIncrement: (String, Number, Callback) =>void
    },
    meta?: Object,
    statsdKey?: String,
    statsdWaitPeriod?: Number,
    backupFile?: "stdout" | "stderr" | String,
    abortOnUncaught?: Boolean,
    loggerTimeout?: Number,
    statsdTimeout?: Number,
    shutdownTimeout?: Number,
    gracefulShutdown?: (Callback) => void,
    preAbort?: () => void
}) => onError: (Error) => void
```

`uncaughtHandler` takes an options object and returns an error
  handling function that can be passed to `'uncaughtException'`
  listener of the `process`.

You must pass the `uncaughtHandler` a `logger` with a `fatal()`
  method.

The `uncaughtHandler` will exit your process once it's done
  logging the error.

#### `options.logger`

`options.logger` is a logger object used to log the exception.
  It's expected to have a `fatal()` method that takes a string,
  an error object and a callback.

The `logger` should invoke the `callback` once it's flushed it to
  all the logging backends you support, (i.e. disk, sentry, etc)

#### `options.statsd`

`options.statsd` is a statsd object used to increment counters.
  It's expected to have a `immediateIncrement()` method that
  takes a string, a number and a callback.

The `statsd` should invoke the `callback` once it's flushed it
  to the stats service.

#### `options.meta`

`options.meta` allows you to configure the meta object that is
  logged when an uncaught exception occurs. You might want to 
  put the `os.hostname()` in the meta object.

#### `options.statsdKey`

`options.statsdKey` allows you to configure what kind of statsd
  key we increment when we have an uncaught exception.

The key defaults to `"service-crash"`.

#### `options.statsdWaitPeriod`

`options.statsdWaitPeriod` is a configurable waiting period.
The node implementation of UDP which the `statsd` client will
probably uses invokes the callback too early.

If you `abort()` synchronously there is no garantuee that we've
actually send the statsd out of the process.

To work around this we have an "arbitrary" waiting period after
we get the `statsd` callback.

`options.statsdWaitPeriod` defaults to `1500` milliseconds

#### `options.backupFile`

`options.backupFile` is a filePath that will be appended to
  synchronously incase anything goes wrong inside the uncaught
  exception handler.

It's highly recommended you pass a backup file path in case your
  logger fails.

Inspecting the `backupFile` and looking at the core dump will
  give you a deep insight into exactly what happened at the
  end of your node process.

You may also pass the string literal `"stdout"` or `"stderr"` as
  the `options.backupFile` property. If you set it to either
  `"stdout"` or `"stderr"` then it will synchronously write to
  `process.stdout` and `process.stderr` respectively.

**Caveat:** If you are running windows and have set 
  `options.backupFile` to `"stdout"` or `"stderr"` then it's not
  garaunteed to be synchronous. In windows any writes to
  `process.stdout` when `process.stdout` is a `PIPE` will be
  asynchronous. i.e. `node foo.js | tee file` will involve
  asynchronous writing to the `backupFile`.

#### `options.abortOnUncaught`

If `options.abortOnUncaught` is set to `true` the uncaught handler
will call graceful shutdown and `process.abort()` for you.

If this is set to `undefined` or `false` the uncaught handler
will not call graceful shutdown and it will not call process abort

#### `options.loggerTimeout`

The `uncaughtHandler` will assume that your logger might fail or
  hang so it times out the fatal logging call.

The default timeout is 30 seconds, you can pass `loggerTimeout`
  if you want to overwrite it.

#### `options.statsdTimeout`

The `uncaughtHandler` will assume that your statsd might fail or
  hang so it times out the statsd increment call.

The default timeout is 5 seconds, you can pass `statsdTimeout`
  if you want to overwrite it.

#### `options.gracefulShutdown`

The `uncaught-exception` module supports doing a graceful
  shutdown. Normally when an uncaught exception happens you
  want to close any servers that are open and wait for all
  sockets to exit cleanly.

This function only gets called if `abortOnUncaught` is set to
`true`.

Ideally you want to empty the event loop and do a full graceful
  shutdown.

You may also want to communicate to the master process if you are
  running under `cluster`.

For more information on proper error handling see the
  [node domain documentation](http://nodejs.org/api/domain.html#domain_warning_don_t_ignore_errors)

#### `options.shutdownTimeout`

The `uncaughtHandler` will assume that your gracefulShutdown
  might fail or hang so it times out the graceful shutdown call.

The default timeout is 30 seconds, you can pass `shutdownTimeout`
  if you want to overwrite it.

#### `options.preAbort`

You can specify your own `preAbort` handler that **MUST** be
  a synchronous function.

This function only gets called if `abortOnUncaught` is set to
`true`.

The main use case is to invoke your own exit strategy instead of
  the default exit strategy which is calling `process.abort()`

For example you may want to `process.exit(1)` here instead.

## Installation

`npm install uncaught-exception`

## tests

`npm test`

## Contributors

 - Raynos
 - dfellis
 - squamos

## MIT Licenced
