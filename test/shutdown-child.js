
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

if (opts.errorLogger) {
    opts.logger = {
        fatal: function fatal(message, opts, cb) {
            cb(new Error('oops in logger.fatal()'));
        }
    };
}

if (!opts.logger) {
    opts.logger = {
        fatal: function fatal(message, opts, cb) {
            cb();
        }
    };
}

if (opts.badShutdown) {
    opts.gracefulShutdown = function gracefulShutdown(cb) {
        cb(new Error('oops in graceful shutdown'));
    };
}

// implement preAbort to get the code coverage OUT of this
// process
opts.preAbort = function preAbort() {
    var listeners = process.listeners('exit');

    var coverageFn = listeners.filter(function check(fn) {
        var listener = fn && fn.listener;
        return String(listener).indexOf(
            'No coverage information was collected') !== -1;
    });

    if (coverageFn.length === 0) {
        return;
    } else if (coverageFn.length > 1) {
        console.error('wtf :S');
        process.exit(24);
    }

    var listener = coverageFn[0].listener;
    listener();

    if (opts.throwInAbort) {
        throw new Error('such troll, so face.');
    }
};

var onError = uncaughtException(opts);
process.on('uncaughtException', onError);

process.nextTick(function throwIt() {
    var err = new Error(opts.message);
    throw err;
});

setInterval(function busyWork() {
    console.log('being busy');
}, 1000);
