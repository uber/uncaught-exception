'use strict';

var once = require('once');
var process = require('process');
var os = require('os');
var domain = require('domain');
var jsonStringify = require('json-stringify-safe');

var tryCatch = require('./lib/try-catch-it.js');
var errors = require('./errors.js');
var Constants = require('./constants.js');

module.exports = UncaughtExceptionHandler;

function UncaughtExceptionHandler(uncaught) {
    /*eslint complexity: [2, 20], max-statements: [2, 25]*/
    var self = this;

    self.uncaught = uncaught;
    self.backupLog = new BackupFileLog(uncaught.fs, uncaught.backupFile);

    self.uncaughtError = null;
    self.loggerError = null;
    self.loggerAsyncError = null;
    self.shutdownError = null;
    self.shutdownAsyncError = null;

    self.stateMachine = null;
    self.currentDomain = null;
    self.currentState = Constants.INITIAL_STATE;
    self.errorCallbacks = {};
    self.timerHandles = {};

    var loggerCallback = asyncOnce(onlogged);
    var shutdownCallback = asyncOnce(onshutdown);

    self.errorCallbacks[Constants.INITIAL_STATE] =
        loggerCallback;
    self.errorCallbacks[Constants.ON_ERROR_STATE] =
        loggerCallback;
    self.errorCallbacks[Constants.PRE_LOGGING_ERROR_STATE] =
        loggerCallback;
    self.errorCallbacks[Constants.LOGGING_ERROR_STATE] =
        loggerCallback;

    self.errorCallbacks[Constants.POST_LOGGING_ERROR_STATE] =
        shutdownCallback;
    self.errorCallbacks[Constants.PRE_GRACEFUL_SHUTDOWN_STATE] =
        shutdownCallback;
    self.errorCallbacks[Constants.GRACEFUL_SHUTDOWN_STATE] =
        shutdownCallback;

    self.errorCallbacks[Constants.POST_GRACEFUL_SHUTDOWN_STATE] =
        onterminate;

    function onlogged(err) {
        self.onLoggerFatal(err);
    }

    function onshutdown(err) {
        self.onGracefulShutdown(err);
    }

    function onterminate() {
        self.handleTerminate();
    }
}

UncaughtExceptionHandler.prototype.handleError =
function handleError(error) {
    var self = this;

    self.currentState = Constants.ON_ERROR_STATE;
    self.uncaughtError = error;
    self.stateMachine = self.uncaught.reporter.createStateMachine(error);

    self.backupLog.log('exception.occurred', self.uncaughtError);

    var currentDomain = self.currentDomain = domain.create();
    currentDomain.on('error', onDomainError);

    currentDomain.run(handleLogError);

    function handleLogError() {
        self.handleLogError();
    }

    function onDomainError(domainError) {
        self.onDomainError(domainError);
    }
};

UncaughtExceptionHandler.prototype.handleLogError =
function handleLogError() {
    var self = this;

    self.currentState = Constants.PRE_LOGGING_ERROR_STATE;
    self.timerHandles.logger = self.uncaught.timers.setTimeout(
        onlogtimeout, self.uncaught.loggerTimeout
    );

    self.uncaught.reporter.reportPreLogging(self);

    var tuple = tryCatch(invokeLoggerFatal);

    self.loggerError = tuple[0];
    self.uncaught.reporter.reportLogging(self);

    if (self.loggerError) {
        self.transition(errors.LoggerThrownException({
            errorMessage: self.loggerError.message,
            errorType: self.loggerError.type,
            errorStack: self.loggerError.stack
        }));
    }

    function invokeLoggerFatal() {
        self.invokeLoggerFatal();
    }

    function onlogtimeout() {
        self.timerHandles.logger = null;

        self.transition(errors.LoggerTimeoutError({
            time: self.uncaught.loggerTimeout
        }));
    }
};

UncaughtExceptionHandler.prototype.invokeLoggerFatal =
function invokeLoggerFatal() {
    var self = this;

    var logger = self.uncaught.logger;
    var prefix = self.uncaught.prefix;
    var error = self.uncaughtError;
    var type = error.type || '';

    self.currentState = Constants.LOGGING_ERROR_STATE;
    logger.fatal(
        prefix + 'Uncaught Exception: ' + type,
        error,
        loggerCallback
    );

    function loggerCallback(err) {
        self.transition(err);
    }
};

UncaughtExceptionHandler.prototype.onLoggerFatal =
function onLoggerFatal(err) {
    var self = this;

    self.currentState = Constants.POST_LOGGING_ERROR_STATE;
    if (self.timerHandles.logger) {
        self.uncaught.timers.clearTimeout(self.timerHandles.logger);
    }

    if (err) {
        self.loggerAsyncError = err;
        self.backupLog.log('logger.uncaught.exception', self.uncaughtError);
        self.backupLog.log('logger.failure', err);
    }

    self.handleGracefulShutdown();
};

UncaughtExceptionHandler.prototype.handleGracefulShutdown =
function handleGracefulShutdown() {
    var self = this;

    self.currentState = Constants.PRE_GRACEFUL_SHUTDOWN_STATE;
    self.timerHandles.shutdown = self.uncaught.timers.setTimeout(
        onshutdowntimeout, self.uncaught.shutdownTimeout
    );

    self.uncaught.reporter.reportPreGracefulShutdown(self);

    var tuple = tryCatch(invokeGracefulShutdown);

    self.shutdownError = tuple[0];
    self.uncaught.reporter.reportShutdown(self);

    if (self.shutdownError) {
        self.transition(errors.ShutdownThrownException({
            errorMessage: self.shutdownError.message,
            errorType: self.shutdownError.type,
            errorStack: self.shutdownError.stack
        }));
    }

    function invokeGracefulShutdown() {
        self.invokeGracefulShutdown();
    }

    function onshutdowntimeout() {
        self.timerHandles.shutdown = null;

        self.transition(errors.ShutdownTimeoutError({
            timer: self.uncaught.shutdownTimeout
        }));
    }
};

UncaughtExceptionHandler.prototype.invokeGracefulShutdown =
function invokeGracefulShutdown() {
    var self = this;
    var gracefulShutdown = self.uncaught.gracefulShutdown;

    self.currentState = Constants.GRACEFUL_SHUTDOWN_STATE;
    gracefulShutdown(shutdownCallback);

    function shutdownCallback(err) {
        self.transition(err);
    }
};

UncaughtExceptionHandler.prototype.onGracefulShutdown =
function onGracefulShutdown(err) {
    var self = this;

    self.currentState = Constants.POST_GRACEFUL_SHUTDOWN_STATE;
    if (self.timerHandles.shutdown) {
        self.uncaught.timers.clearTimeout(self.timerHandles.shutdown);
    }

    if (err) {
        self.shutdownAsyncError = err;
        self.backupLog.log('shutdown.uncaught.exception', self.uncaughtError);
        self.backupLog.log('shutdown.failure', err);
    }

    self.uncaught.reporter.reportPostGracefulShutdown(self);

    self.handleTerminate();
};

UncaughtExceptionHandler.prototype.handleTerminate =
function handleTerminate() {
    var self = this;

    var allState = self.uncaught.reporter.getAllState(self);
    self.internalTerminate(allState);
};

UncaughtExceptionHandler.prototype.internalTerminate =
function internalTerminate(allState) {
    var self = this;
    var preAbort = self.uncaught.preAbort;

    // try and swallow the exception, if you have an
    // exception in preAbort then you're fucked, abort().
    tryCatch(invokePreAbort);
    /* istanbul ignore next: abort() is untestable */
    process.abort();

    function invokePreAbort() {
        preAbort(allState);
    }
};

UncaughtExceptionHandler.prototype.onDomainError =
function onDomainError(domainError) {
    var self = this;
    var currentState = self.currentState;

    if (currentState === Constants.PRE_LOGGING_ERROR_STATE ||
        currentState === Constants.LOGGING_ERROR_STATE
    ) {
        self.transition(errors.LoggerAsyncError({
            errorMessage: domainError.message,
            errorType: domainError.type,
            errorStack: domainError.stack,
            currentState: currentState
        }));
    } else if (
        currentState === Constants.PRE_GRACEFUL_SHUTDOWN_STATE ||
        currentState === Constants.GRACEFUL_SHUTDOWN_STATE
    ) {
        self.transition(errors.ShutdownAsyncError({
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
        self.transition();
    } else {
        // it's impossible to get into this state.
        // but if we do we should terminate anyway
        /* istanbul ignore next: never happens */
        self.handleTerminate();
    }
};

UncaughtExceptionHandler.prototype.transition =
function transition(error) {
    var self = this;

    self.uncaught.reporter.markTransition(self);
    var nextCallback = self.errorCallbacks[self.currentState];

    /* istanbul ignore else  */
    if (nextCallback) {
        nextCallback(error);
    } else {
        // it's impossible to get into this state.
        // but if we do we should terminate anyway
        /* istanbul ignore next: never happens */
        self.handleTerminate();
    }
};

function BackupFileLog(fs, backupFile) {
    var self = this;

    self.fs = fs;
    self.backupFile = backupFile;

    self.lines = {};
}

BackupFileLog.prototype.log =
function log(message, error) {
    var self = this;

    if (!self.backupFile) {
        return;
    }

    var str = self.stringifyError(error, message);
    self.lines[message] = str;
    self.safeAppend(self.fs, self.backupFile, str);
};

BackupFileLog.prototype.stringifyError =
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
};

BackupFileLog.prototype.safeAppend =
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
};

function asyncOnce(fn) {
    return once(function defer() {
        var args = arguments;
        var self = this;

        process.nextTick(function callIt() {
            fn.apply(self, args);
        });
    });
}
