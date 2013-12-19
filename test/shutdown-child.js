
/* SHUTDOWN child.

    This process gets spawned by the shutdown.js test. It's used
        to test the effect of the uncaught handler and whether
        it handles shutdown cleanly
*/

var console = require('console');
var uncaughtException = require('../uncaught.js');
var opts = JSON.parse(process.argv[2]);

if (opts.consoleLogger) {
    opts.logger = {
        log: function (type, message, meta, cb) {
            if (type === 'error') {
                console.error(message, meta);
            } else {
                console.log(message, meta);
            }
            cb();
        },
        info: function (message) {
            console.log(message);
        },
        error: function (message, meta, cb) {
            console.error(message, meta);
            cb();
        }
    };
}

var onError = uncaughtException(opts);

process.on('uncaughtException', onError);

process.nextTick(function () {
    var err = new Error(opts.message);
    err.connection = opts.connection;
    throw err;
});
