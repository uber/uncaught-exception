'use strict';

var globalFs = require('fs');
var once = require('once');
var process = require('process');
var os = require('os');
var domain = require('domain');
var globalSetTimeout = require('timers').setTimeout;
var globalClearTimeout = require('timers').clearTimeout;
var jsonStringify = require('json-stringify-safe');

var tryCatch = require('./lib/try-catch-it.js');
var errors = require('./errors.js');
var structures = require('./structures.js');
var Constants = require('./constants.js');

var ALL_STATES = [];

module.exports = uncaught;

function uncaught(options) {
    /*eslint complexity: [2, 20], max-stements: [2, 25]*/
    if (!options || typeof options.logger !== 'object') {
        throw errors.LoggerRequired({
            logger: options && options.logger
        });
    }

    if ('backupFile' in options &&
        typeof options.backupFile !== 'string'
    ) {
        throw errors.InvalidBackupFile({
            backupFile: options.backupFile
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
        options.loggerTimeout : Constants.LOGGER_TIMEOUT;
    var shutdownTimeout =
        typeof options.shutdownTimeout === 'number' ?
        options.shutdownTimeout : Constants.SHUTDOWN_TIMEOUT;

    var gracefulShutdown =
        typeof options.gracefulShutdown === 'function' ?
        options.gracefulShutdown : asyncNoop;
    var preAbort = typeof options.preAbort === 'function' ?
        options.preAbort : noop;

    var configValue = new structures.UncaughtExceptionConfigValue({
        prefix: prefix,
        backupFile: backupFile,
        loggerTimeout: loggerTimeout,
        shutdownTimeout: shutdownTimeout,
        hasGracefulShutdown: gracefulShutdown !== asyncNoop,
        hasPreAbort: preAbort !== noop,
        hasFakeFS: fs !== globalFs,
        hasFakeSetTimeout: setTimeout !== globalSetTimeout,
        hasFakeClearTimeout: clearTimeout !== globalClearTimeout
    });

    return uncaughtListener;

    function uncaughtListener(error) {
        var type = error.type || '';
        var timers = {};
        var loggerCallback = asyncOnce(onlogged);
        var shutdownCallback = asyncOnce(onshutdown);
        var d = domain.create();
        var currentState = Constants.PRE_LOGGING_ERROR_STATE;

        var errorCallbacks = {};
        errorCallbacks[Constants.PRE_LOGGING_ERROR_STATE] =
            loggerCallback;
        errorCallbacks[Constants.LOGGING_ERROR_STATE] =
            loggerCallback;
        errorCallbacks[Constants.PRE_GRACEFUL_SHUTDOWN_STATE] =
            shutdownCallback;
        errorCallbacks[Constants.GRACEFUL_SHUTDOWN_STATE] =
            shutdownCallback;
        errorCallbacks[Constants.POST_GRACEFUL_SHUTDOWN_STATE] =
            terminate;

        var stateMachine = new structures.UncaughtExceptionStateMachine();
        stateMachine.configValue = configValue;
        stateMachine.uncaughtError = error;
        stateMachine.uncaughtErrorType = type;
        ALL_STATES.push(stateMachine);

        d.on('error', onDomainError);

        timers.logger = setTimeout(onlogtimeout, loggerTimeout);

        stateMachine.addTransition(
            new structures.UncaughtExceptionPreLoggingErrorState({
                currentState: currentState,
                currentDomain: d,
                timerHandle: timers.logger
            })
        );

        d.run(logError);

        function logError() {
            var str = null;
            if (backupFile) {
                str = stringifyError(error, 'exception.occurred');
                safeAppend(fs, backupFile, str);
            }

            currentState = Constants.LOGGING_ERROR_STATE;
            var tuple = tryCatch(function tryIt() {
                logger.fatal(prefix + 'Uncaught Exception: ' +
                    type, error, loggerCallback);
            });

            var loggerError = tuple[0];

            stateMachine.addTransition(
                new structures.UncaughtExceptionLoggingErrorState({
                    backupFileLine: str,
                    currentState: currentState,
                    loggerError: loggerError
                })
            );

            if (loggerError) {
                var errorCallback = errorCallbacks[currentState];
                errorCallback(errors.LoggerThrownException({
                    errorMessage: loggerError.message,
                    errorType: loggerError.type,
                    errorStack: loggerError.stack
                }));
            }
        }

        function onlogged(err) {
            currentState = Constants.PRE_GRACEFUL_SHUTDOWN_STATE;
            if (timers.logger) {
                clearTimeout(timers.logger);
            }

            var str = null;
            var str2 = null;

            if (err && backupFile) {
                str = stringifyError(
                    error, 'uncaught.exception');
                safeAppend(fs, backupFile, str);
                str2 = stringifyError(
                    err, 'logger.failure');
                safeAppend(fs, backupFile, str2);
            }

            timers.shutdown = setTimeout(onshutdowntimeout,
                shutdownTimeout);

            stateMachine.addTransition(
                new structures.UncaughtExceptionPreGracefulShutdownState({
                    currentState: currentState,
                    fatalLoggingError: err,
                    backupFileUncaughtErrorLine: str,
                    backupFileLoggerErrorLine: str2,
                    shutdownTimer: timers.shutdown
                })
            );

            var tuple2 = tryCatch(function tryIt() {
                currentState = Constants.GRACEFUL_SHUTDOWN_STATE;
                gracefulShutdown(shutdownCallback);
            });

            var shutdownError = tuple2[0];

            stateMachine.addTransition(
                new structures.UncaughtExceptionGracefulShutdownState({
                    currentState: currentState,
                    shutdownError: shutdownError
                })
            );

            if (shutdownError) {
                var errorCallback = errorCallbacks[currentState];
                errorCallback(errors.ShutdownThrownException({
                    errorMessage: shutdownError.message,
                    errorType: shutdownError.type,
                    errorStack: shutdownError.stack
                }));
            }
        }

        function onshutdown(err) {
            currentState = Constants.POST_GRACEFUL_SHUTDOWN_STATE;
            if (timers.shutdown) {
                clearTimeout(timers.shutdown);
            }

            var str = null;
            var str2 = null;

            if (err && backupFile) {
                str = stringifyError(
                    error, 'uncaught.exception');
                safeAppend(fs, backupFile, str);
                str2 = stringifyError(
                    err, 'shutdown.failure');
                safeAppend(fs, backupFile, str2);
            }

            stateMachine.addTransition(
                new structures.UncaughtExceptionPostGracefulShutdownState({
                    currentState: currentState,
                    gracefulShutdownError: err,
                    backupFileUncaughtErrorLine: str,
                    backupFileShutdownErrorLine: str2
                })
            );

            terminate();
        }

        function terminate() {
            var struct = new structures.UncaughtExceptionStruct(
                stateMachine, ALL_STATES
            );

            internalTerminate(struct);
        }

        function internalTerminate(uncaughtExceptionStruct) {
            // try and swallow the exception, if you have an
            // exception in preAbort then you're fucked, abort().
            tryCatch(function invokePreAbort() {
                preAbort(uncaughtExceptionStruct);
            });
            /* istanbul ignore next: abort() is untestable */
            process.abort();
        }

        function onDomainError(domainError) {
            var errorCallback = errorCallbacks[currentState];

            if (currentState === Constants.PRE_LOGGING_ERROR_STATE ||
                currentState === Constants.LOGGING_ERROR_STATE
            ) {
                errorCallback(errors.LoggerAsyncError({
                    errorMessage: domainError.message,
                    errorType: domainError.type,
                    errorStack: domainError.stack,
                    currentState: currentState
                }));
            } else if (
                currentState === Constants.PRE_GRACEFUL_SHUTDOWN_STATE ||
                currentState === Constants.GRACEFUL_SHUTDOWN_STATE
            ) {
                errorCallback(errors.ShutdownAsyncError({
                    errorMessage: domainError.message,
                    errorType: domainError.type,
                    errorStack: domainError.stack,
                    currentState: currentState
                }));
            /* istanbul ignore else: impossible else block */
            } else if (
                currentState === Constants.POST_GRACEFUL_SHUTDOWN_STATE
            ) {
                // if something failed in after shutdown
                // then we are in a terrible state, shutdown
                // hard.
                errorCallback();
            } else {
                // it's impossible to get into this state.
                // but if we do we should terminate anyway
                /* istanbul ignore next: never happens */
                terminate();
            }
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

function asyncOnce(fn) {
    return once(function defer() {
        var args = arguments;
        var self = this;

        process.nextTick(function callIt() {
            fn.apply(self, args);
        });
    });
}

function asyncNoop(cb) {
    process.nextTick(cb);
}

function stringifyError(error, uncaughtType) {
    var d = new Date();

    return jsonStringify({
        message: error.message,
        type: error.type,
        _uncaughtType: uncaughtType,
        pid: process.pid,
        hostname: os.hostname(),
        ts: d.toISOString(),
        stack: error.stack
    }) + '\n';
}

function safeAppend(fs, backupFile, str) {
    // try appending to the file. If this throws then just
    // ignore it and carry on. If we cannot write to this file
    // like it doesnt exist or read only file system then there
    // is no recovering
    tryCatch(function append() {
        if (backupFile === 'stdout') {
            process.stdout.write(str);
        } else if (backupFile === 'stderr') {
            process.stderr.write(str);
        } else {
            fs.appendFileSync(backupFile, str);
        }
    });
}

/* istanbul ignore next: preAbort is never noop in tests */
function noop() {}
