# uncaught-exception

Handle uncaught exceptions.

This is designed for node 0.8.8. The domain & uncaught handlers
    may not work well in node 0.10

## Example

```js
var uncaughtHandler = require('uncaught-exception/uncaught');
var domainHandler = require('uncaught-exception/domain');

// uncaughtHandler returns an error handling function that you
// can pass to `process.on('uncaughtException')`
var onError = uncaughtHandler({
    scope: 'some name of process',
    logger: { error: function (message, opts, callback) {
        // sink the error somewhere. We log the uncaught error
        // and call the callback when its done
    } },
    verbose: true, // opt into more verbose error logging
    logError: function (error, callback) {
        // decide how you want to log the actual error object
        // yourself. This function is only called in verbose
        // mode. If you decorated your `Error` instance with
        // any properties, you can stringify that data as well.
    },
    // if set to false the process will continue running.
    // this can cause undefined state bugs. Not recommended!
    crashOnException: true 
});
process.on('uncaughtException', onError);

var createDomain = domainHandler();

http.createServer(function (req, res) {
    createDomain([req, res], function handleError(err, domain) {
        // an error occured in the domain. Here we can do cleanup

        var code = 500;
        // you can decorate the err. This allows you to print
        // extra information from the error in `logError` for
        // the uncaught handler
        err.code = code;
        res.statusCode = 500;
        res.end("Error: " + err.message);
        // don't forget to dispose the domain!
        domain.dispose();
    }, function onRun() {
        // this is running in a domain

        setTimeout(function () {
            throw new Error('oops!');
        }, 100);
    })
})
```

## Installation

`npm install uncaught-exception`

## tests

`npm test`

## Contributors

 - Raynos
 - dfellis
 - squamos

## MIT Licenced
