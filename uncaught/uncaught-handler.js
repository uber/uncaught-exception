'use strict';

var process = require('process');
var domain = require('domain');

var tryCatch = require('../lib/try-catch-it.js');
var errors = require('./errors.js');
var Constants = require('./constants.js');
var BackupFileLog = require('./backup-file-log.js');

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
    self.timerHandles = {};
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

    currentDomain.enter();
    self.handleLogError();
    currentDomain.exit();

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

    var tuple = tryCatch(function invokeLoggerFatal() {
        self.invokeLoggerFatal();
    });

    self.loggerError = tuple[0];
    self.uncaught.reporter.reportLogging(self);

    if (self.loggerError) {
        self.transition(errors.LoggerThrownException({
            errorMessage: self.loggerError.message,
            errorType: self.loggerError.type,
            errorStack: self.loggerError.stack
        }));
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

    self.uncaught.reporter.reportPostLogging(self);

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

    var tuple = tryCatch(function invokeGracefulShutdown() {
        self.invokeGracefulShutdown();
    });

    self.shutdownError = tuple[0];
    self.uncaught.reporter.reportShutdown(self);

    if (self.shutdownError) {
        self.transition(errors.ShutdownThrownException({
            errorMessage: self.shutdownError.message,
            errorType: self.shutdownError.type,
            errorStack: self.shutdownError.stack
        }));
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
    tryCatch(function invokePreAbort() {
        preAbort(allState);
    });
    /* istanbul ignore next: abort() is untestable */
    process.abort();
};

UncaughtExceptionHandler.prototype.onDomainError =
function onDomainError(domainError) {
    var self = this;
    var currentState = self.currentState;

    switch (currentState) {
        /* istanbul ignore next: hard to hit */
        case Constants.INITIAL_STATE:
        /* istanbul ignore next: hard to hit */
        case Constants.ON_ERROR_STATE:
        /* istanbul ignore next: hard to hit */
        case Constants.PRE_LOGGING_ERROR_STATE:
        case Constants.LOGGING_ERROR_STATE:
            self.transition(errors.LoggerAsyncError({
                errorMessage: domainError.message,
                errorType: domainError.type,
                errorStack: domainError.stack,
                currentState: currentState
            }));
            break;

        /* istanbul ignore next: hard to hit */
        case Constants.POST_LOGGING_ERROR_STATE:
        /* istanbul ignore next: hard to hit */
        case Constants.PRE_GRACEFUL_SHUTDOWN_STATE:
        case Constants.GRACEFUL_SHUTDOWN_STATE:
            self.transition(errors.ShutdownAsyncError({
                errorMessage: domainError.message,
                errorType: domainError.type,
                errorStack: domainError.stack,
                currentState: currentState
            }));
            break;

        /* istanbul ignore next: impossible else block */
        case Constants.POST_GRACEFUL_SHUTDOWN_STATE:
            // if something failed in after shutdown
            // then we are in a terrible state, shutdown
            // hard.
            self.transition();
            break;

        /* istanbul ignore next: never happens */
        default:
            // it's impossible to get into this state.
            // but if we do we should terminate anyway
            self.handleTerminate();
            break;
    }
};

UncaughtExceptionHandler.prototype.transition =
function transition(error) {
    var self = this;

    self.uncaught.reporter.markTransition(self);

    switch (self.currentState) {
        /* istanbul ignore next: hard to hit */
        case Constants.INITIAL_STATE:
        /* istanbul ignore next: hard to hit */
        case Constants.ON_ERROR_STATE:
        /* istanbul ignore next: hard to hit */
        case Constants.PRE_LOGGING_ERROR_STATE:
        case Constants.LOGGING_ERROR_STATE:
            self.onLoggerFatal(error);
            break;

        /* istanbul ignore next: hard to hit */
        case Constants.POST_LOGGING_ERROR_STATE:
        /* istanbul ignore next: hard to hit */
        case Constants.PRE_GRACEFUL_SHUTDOWN_STATE:
        case Constants.GRACEFUL_SHUTDOWN_STATE:
            self.onGracefulShutdown(error);
            break;

        /* istanbul ignore next: impossible else block */
        case Constants.POST_GRACEFUL_SHUTDOWN_STATE:
            // if something failed in after shutdown
            // then we are in a terrible state, shutdown
            // hard.
            self.handleTerminate();
            break;

        /* istanbul ignore next: never happens */
        default:
            // it's impossible to get into this state.
            // but if we do we should terminate anyway
            self.handleTerminate();
            break;
    }
};
