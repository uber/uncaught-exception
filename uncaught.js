var globalFs = require('fs');
var once = require('once');
var process = require('process');
var globalSetTimeout = require('timers').setTimeout;
var globalClearTimeout = require('timers').clearTimeout;

var tryCatch = require('./lib/try-catch-it.js');
var errors = require('./errors.js');

var LOGGER_TIMEOUT = 30 * 1000;
var SHUTDOWN_TIMEOUT = 30 * 1000;

module.exports = uncaught;

function uncaught(options) {
    if (!options || typeof options.logger !== 'object') {
        throw errors.LoggerRequired({
            logger: options && options.logger
        });
    }

    var logger = options.logger;

    if (!logger || typeof logger.fatal !== 'function') {
        throw errors.LoggerMethodRequired({
            logger: logger,
            keys: Object.keys(logger)
        });
    }

    var fs = options.fs || globalFs;
    var setTimeout = options.setTimeout || globalSetTimeout;
    var clearTimeout = options.clearTimeout ||
        globalClearTimeout;

    var prefix = options.prefix ? String(options.prefix) : '';
    var backupFile = typeof options.backupFile === 'string' ?
        options.backupFile : null;
    var loggerTimeout =
        typeof options.loggerTimeout === 'number' ?
        options.loggerTimeout : LOGGER_TIMEOUT;
    var shutdownTimeout =
        typeof options.shutdownTimeout === 'number' ?
        options.shutdownTimeout : SHUTDOWN_TIMEOUT;

    var gracefulShutdown =
        typeof options.gracefulShutdown === 'function' ?
        options.gracefulShutdown : asyncNoop;
    var preAbort = typeof options.preAbort === 'function' ?
        options.preAbort : noop;

    return uncaughtListener;

    function uncaughtListener(error) {
        var type = error.type || '';
        var timers = {};
        var loggerCallback = once(onlogged);
        var shutdownCallback = once(onshutdown);

        timers.logger = setTimeout(onlogtimeout, loggerTimeout);

        var tuple = tryCatch(function tryIt() {
            logger.fatal(prefix + 'Uncaught Exception: ' + type,
                error, loggerCallback);
        });

        var loggerError = tuple[0];
        if (loggerError) {
            loggerCallback(errors.LoggerThrownException({
                errorMessage: loggerError.message,
                errorType: loggerError.type,
                errorStack: loggerError.stack
            }));
        }

        function onlogged(err) {
            if (err && backupFile) {
                var str = stringifyError(
                    error, 'uncaught.exception');
                safeAppend(fs, backupFile, str);
                var str2 = stringifyError(
                    err, 'logger.failure');
                safeAppend(fs, backupFile, str2);
            }

            if (timers.logger) {
                clearTimeout(timers.logger);
            }

            timers.shutdown = setTimeout(onshutdowntimeout,
                shutdownTimeout);

            var tuple2 = tryCatch(function tryIt() {
                gracefulShutdown(shutdownCallback);
            });

            var shutdownError = tuple2[0];
            if (shutdownError) {
                shutdownCallback(errors.ShutdownThrownException({
                    errorMessage: shutdownError.message,
                    errorType: shutdownError.type,
                    errorStack: shutdownError.stack
                }));
            }
        }

        function onshutdown(err) {
            if (err && backupFile) {
                var str = stringifyError(
                    error, 'uncaught.exception');
                safeAppend(fs, backupFile, str);
                var str2 = stringifyError(
                    err, 'shutdown.failure');
                safeAppend(fs, backupFile, str2);
            }

            if (timers.shutdown) {
                clearTimeout(timers.shutdown);
            }

            // try and swallow the exception, if you have an
            // exception in preAbort then your fucked, abort().
            tryCatch(preAbort);
            process.abort();
        }

        function onlogtimeout() {
            timers.logger = null;

            loggerCallback(errors.LoggerTimeoutError({
                time: loggerTimeout
            }));
        }

        function onshutdowntimeout() {
            timers.shutdown = null;

            shutdownCallback(errors.ShutdownTimeoutError({
                timer: shutdownTimeout
            }));
        }
    }
}

function asyncNoop(cb) {
    process.nextTick(cb);
}

function stringifyError(error, uncaughtType) {
    return JSON.stringify({
        message: error.message,
        type: error.type,
        _uncaughtType: uncaughtType,
        stack: error.stack
    }) + '\n';
}

function safeAppend(fs, backupFile, str) {
    // try appending to the file. If this throws then just
    // ignore it and carry on. If we cannot write to this file
    // like it doesnt exist or read only file system then there
    // is no recovering
    tryCatch(function append() {
        fs.appendFileSync(backupFile, str);
    });
}

function noop() {}
