
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
        fatal: function fatal(message, opts, cb) {
            console.error(message, {
                message: opts.message,
                stack: opts.stack
            });
            cb();
        }
    };
}

var onError = uncaughtException(opts);
process.on('uncaughtException', onError);

process.nextTick(function throwIt() {
    var err = new Error(opts.message);
    throw err;
});

setInterval(function busyWork() {
    console.log('being busy');
}, 1000);
