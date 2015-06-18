'use strict';
/* SHUTDOWN child.

    This process gets spawned by the shutdown.js test. It's used
        to test the effect of the uncaught handler and whether
        it handles shutdown cleanly
*/

var console = require('console');
var process = require('process');
var setTimeout = require('timers').setTimeout;
var StatsdClient = require('uber-statsd-client');

var uncaughtException = require('../uncaught.js');
var EventReporter = require('./lib/event-reporter.js');
var opts = JSON.parse(process.argv[2]);

if (opts.consoleLogger) {
    opts.logger = {
        fatal: function fatal(message, meta, cb) {
            console.error(message, meta);
            cb();
        }
    };
}

if (opts.errorLogger) {
    opts.logger = {
        fatal: function fatal(message, meta, cb) {
            cb(new Error('oops in logger.fatal()'));
        }
    };
}

if (opts.asyncErrorLogger) {
    opts.logger = {
        fatal: function fatal() {
            // simulate buggy logger
            process.nextTick(function throwIt() {
                throw new Error('async oops');
            });
        }
    };
}

if (opts.timeoutLogger) {
    opts.logger = {
        fatal: function fatal() {
            // do nothing. simulate a timeout
        }
    };
}

if (opts.thrownLogger) {
    opts.logger = {
        fatal: function fatal() {
            // simulate a buggy logger
            throw new Error('buggy logger');
        }
    };
}

if (opts.lateTimeoutLogger) {
    opts.logger = {
        fatal: function fatal(message, meta, cb) {
            // simulate a really slow logger
            setTimeout(function delay() {
                cb();
            }, opts.loggerTimeout * 2);
        }
    };
}

if (!opts.logger) {
    opts.logger = {
        fatal: function fatal(message, meta, cb) {
            cb();
        }
    };
}

if (!opts.statsd) {
    opts.statsd = {
        immediateIncrement: function inc(key, n, cb) {
            cb();
        }
    };
}

if (opts.badShutdown) {
    opts.gracefulShutdown = function gracefulShutdown(cb) {
        cb(new Error('oops in graceful shutdown'));
    };
}

if (opts.naughtyShutdown) {
    opts.gracefulShutdown = function gracefulShutdown(cb) {
        // Create a fake error object that causes an
        // unexpected thrown exception in the uncaught
        // exception implementation and check we still abort
        var error = {};
        Object.defineProperty(error, 'message', {
            get: function throwIt() {
                throw new Error('suprise bug!');
            }
        });

        console.log('gracefulShutdown called');

        cb(error);
    };
}

if (opts.asyncBadShutdown) {
    opts.gracefulShutdown = function gracefulShutdown() {
        // simulate a buggy graceful shutdown
        process.nextTick(function throwIt() {
            throw new Error('async buggy shutdown');
        });
    };
}

if (opts.timeoutShutdown) {
    opts.gracefulShutdown = function timeoutShutdown() {
        // do nothing. simulate a timeout
    };
}

if (opts.thrownShutdown) {
    opts.gracefulShutdown = function gracefulShutdown() {
        // simulate a buggy graceful shutdown
        throw new Error('buggy graceful shutdown');
    };
}

if (opts.lateTimeoutShutdown) {
    opts.gracefulShutdown = function timeoutShutdown(cb) {
        // simulate a really show shutdown
        setTimeout(function delay() {
            cb();
        }, opts.shutdownTimeout * 2);
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
        console.error('Unexpected multiple functions');
        process.exit(24);
    }

    var listener = coverageFn[0].listener;
    listener();

    if (opts.throwInAbort) {
        throw new Error('bug in preAbort');
    }
    if (opts.exitOnPreAbort) {
        process.exit(101);
    }
};

if (opts.exitCode && opts.abortOnUncaught === false) {
    opts.reporter = EventReporter();
    opts.reporter.once('reportPostStatsd', function a() {
        setTimeout(function onExit() {
            process.exit(opts.exitCode);
        }, 10);
    });
}

if (opts.exitOnGracefulShutdown) {
    opts.gracefulShutdown = function exitIt() {
        process.exit(101);
    };
}

if (opts.abortOnUncaught === undefined) {
    opts.abortOnUncaught = true;
}
if (opts.statsdWaitPeriod === undefined) {
    opts.statsdWaitPeriod = 0;
}

if (opts.udpServer) {
    opts.statsd = new StatsdClient({
        host: '127.0.0.1',
        port: opts.udpServer.port
    });
}
if (opts.statsdDelay) {
    var func = opts.statsd.immediateIncrement;
    opts.statsd.immediateIncrement = function p(k, n, cb) {
        setTimeout(function onTimer() {
            func.call(opts.statsd, k, n);
        }, opts.statsdDelay);

        cb();
    };
}

if (opts.throwStatsdException) {
    opts.statsd = {
        immediateIncrement: function inc() {
            throw new Error('sync statsd exception');
        }
    };
}
if (opts.timeoutStatsd) {
    opts.statsd = {
        immediateIncrement: function inc() {
            // do not call cb()
        }
    };
}
if (opts.statsdShouldError) {
    opts.statsd = {
        immediateIncrement: function inc(k, n, cb) {
            cb(new Error('statsd write fail'));
        }
    };
}
if (opts.statsdAsyncThrow) {
    opts.statsd = {
        immediateIncrement: function inc() {
            process.nextTick(function oh() {
                throw new Error('bye lol');
            });
        }
    };
}

var onError = uncaughtException(opts);
process.on('uncaughtException', onError);

process.nextTick(function throwIt() {
    var err = new Error(opts.message);
    throw err;
});
