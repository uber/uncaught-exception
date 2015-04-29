'use strict';

var globalFs = require('fs');
var process = require('process');
var globalSetTimeout = require('timers').setTimeout;
var globalClearTimeout = require('timers').clearTimeout;

var errors = require('./uncaught/errors.js');
var MemoryReporter = require('./uncaught/memory-reporter.js');
var Constants = require('./uncaught/constants.js');
var UncaughtExceptionHandler = require('./uncaught/uncaught-handler.js');

module.exports = createUncaught;

function UncaughtException(options) {
    var self = this;

    self.options = options;

    self.logger = options.logger;
    self.fs = options.fs || globalFs;
    self.timers = {
        setTimeout: options.setTimeout || globalSetTimeout,
        clearTimeout: options.clearTimeout || globalClearTimeout
    };
    self.prefix = options.prefix ? String(options.prefix) : '';
    self.backupFile = typeof options.backupFile === 'string' ?
        options.backupFile : null;
    self.loggerTimeout =
        typeof options.loggerTimeout === 'number' ?
        options.loggerTimeout : Constants.LOGGER_TIMEOUT;
    self.shutdownTimeout =
        typeof options.shutdownTimeout === 'number' ?
        options.shutdownTimeout : Constants.SHUTDOWN_TIMEOUT;
    self.abortOnUncaught =
        typeof options.abortOnUncaught === 'boolean' ?
        options.abortOnUncaught : false;

    self.gracefulShutdown =
        typeof options.gracefulShutdown === 'function' ?
        options.gracefulShutdown : asyncNoop;
    self.preAbort = typeof options.preAbort === 'function' ?
        options.preAbort : noop;

    self.reporter = options.reporter || new MemoryReporter();
    self.handlers = [];
}

UncaughtException.prototype.handleError =
function handleError(error) {
    var self = this;

    var handler = new UncaughtExceptionHandler(self);
    self.handlers.push(handler);

    handler.handleError(error);
};

function createUncaught(options) {
    /*eslint complexity: [2, 20], max-statements: [2, 25]*/
    checkOptions(options);

    var uncaught = new UncaughtException(options);
    uncaught.reporter.reportConfig(uncaught);

    return uncaughtListener;

    function uncaughtListener(error) {
        uncaught.handleError(error);
    }
}

function checkOptions(options) {
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
}

function asyncNoop(cb) {
    process.nextTick(cb);
}

/* istanbul ignore next: preAbort is never noop in tests */
function noop() {}
