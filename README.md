# uncaught-exception

Handle uncaught exceptions.

Supports 0.10 only. Designed for robustness and garaunteed
    eventual termination of the process.

## Example

```js
var uncaughtHandler = require('uncaught-exception');

var myLogger = {
    fatal: function (message, metaObj, callback) {
        // must call the callback once logged
    }
}

var onError = uncaughtHandler({
    logger: myLogger,
    prefix: 'some string prefix ',
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

## Docs

### Type definitions

See [docs.mli for type definitions](docs.mli)

### `var onError = uncaughtHandler(options)`

```
uncaught-exception/uncaught := (options: {
    logger: {
        fatal: (String, Object, Callback) => void
    },
    prefix?: String,
    backupFile?: String,
    loggerTimeout?: Number,
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

#### `options.prefix`

`options.prefix` allows you to configure a prefix for this
  uncaught handler. You might want to put the `os.hostname()` in
  the prefix.

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

#### `options.loggerTimeout`

The `uncaughtHandler` will assume that your logger might fail or
  hang so it times out the fatal logging call.

The default timeout is 30 seconds, you can pass `loggerTimeout`
  if you want to overwrite it.

#### `options.gracefulShutdown`

The `uncaught-exception` module supports doing a graceful
  shutdown. Normally when an uncaught exception happens you
  want to close any servers that are open and wait for all
  sockets to exit cleanly.

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

The main use case is to invoke your own exit strategy instead of
  the default exit strategy which is calling `process.abort()`

For example you may want to `process.exit(1)` here instead.

### `var onError = createUncaught(zeroConf, clients, opts?, cb?)`

```jsig
import { Logger } from "logtron"

type FilePath : String

type ZeroConfig<configValues: T> : {
    get: (key: String) => value: Any
}

playdoh-clients/uncaught : (
    config: ZeroConfig<{
        "project": String,
        "playdoh-uncaught": {
            backupFile: FilePath,
            loggerTimeout?: Number,
            shutdownTimeout?: Number
        }
    }>,
    clients: Object & { logger: Logger },
    options?: {
        gracefulShutdown?: (Callback<Error, void>) => void,
        env?: Object<String, String>
    },
    cb?: Callback<Error, void>
) => onError: (Error) => void
```

the `uncaught` module will set an `onError` property on the
    `clients` argument. This `onError` property is a function
    that serializes the error.

The actual `onError` function is an created by the
    [`uncaught-exception`][uncaught-exception] module

Example:

```js
var zeroConfig = require('zero-config');
var createLogger = require('playdoh-clients/logger')
var createUncaught = require('playdoh-clients/uncaught');

var config = zeroConfig(__dirname);
var onError = createUncaught(config, {
    logger: createLogger(config)
});
process.on('uncaughtException', onError);
```

```js
// config/common.json
{
    "project": "my-project",
    "playdoh-uncaught": {
        backupFile: "/var/log/my-project"
    }
}
```

#### `config`

The 

[uncaught-exception

## Installation

`npm install uncaught-exception`

## tests

`npm test`

## Contributors

 - Raynos
 - dfellis
 - squamos

## MIT Licenced
