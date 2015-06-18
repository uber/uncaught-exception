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
    self.statsd = options.statsd;
    self.fs = options.fs || globalFs;
    self.timers = {
        setTimeout: options.setTimeout || globalSetTimeout,
        clearTimeout: options.clearTimeout || globalClearTimeout
    };

    self.meta = options.meta;
    self.backupFile = typeof options.backupFile === 'string' ?
        options.backupFile : null;
    self.statsdKey = typeof options.statsdKey === 'string' ?
        options.statsdKey : 'service-crash';
    self.abortOnUncaught =
        typeof options.abortOnUncaught === 'boolean' ?
        options.abortOnUncaught : false;

    self.loggerTimeout =
        typeof options.loggerTimeout === 'number' ?
        options.loggerTimeout : Constants.LOGGER_TIMEOUT;
    self.statsdTimeout =
        typeof options.statsdTimeout === 'number' ?
        options.statsdTimeout : Constants.STATSD_TIMEOUT;
    self.shutdownTimeout =
        typeof options.shutdownTimeout === 'number' ?
        options.shutdownTimeout : Constants.SHUTDOWN_TIMEOUT;
    self.statsdWaitPeriod =
        typeof options.statsdWaitPeriod === 'number' ?
        options.statsdWaitPeriod : Constants.STATSD_WAIT_PERIOD;

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
    if (!options || typeof options.statsd !== 'object') {
        throw errors.StatsdRequired({
            statsd: options && options.statsd
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
            keys: logger && Object.keys(logger)
        });
    }

    var statsd = options.statsd;

    if (!statsd || typeof statsd.immediateIncrement !== 'function') {
        throw errors.StatsdMethodRequired({
            statsd: statsd,
            keys: statsd && Object.keys(statsd)
        });
    }
}

function asyncNoop(cb) {
    process.nextTick(cb);
}

/* istanbul ignore next: preAbort is never noop in tests */
function noop() {}
