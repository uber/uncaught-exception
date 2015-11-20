'use strict';

/*

This contains a set of data structures designed for being easily
found when debugging a core dump

*/

var ALL_STATES = [];
var Constants = require('./constants.js');

var structures = {
    UncaughtExceptionStateMachine:
        UncaughtExceptionStateMachine,
    UncaughtExceptionConfigValue:
        UncaughtExceptionConfigValue,
    UncaughtExceptionPreLoggingErrorState:
        UncaughtExceptionPreLoggingErrorState,
    UncaughtExceptionLoggingErrorState:
        UncaughtExceptionLoggingErrorState,
    UncaughtExceptionPostLoggingErrorState:
        UncaughtExceptionPostLoggingErrorState,
    UncaughtExceptionPreGracefulShutdownState:
        UncaughtExceptionPreGracefulShutdownState,
    UncaughtExceptionGracefulShutdownState:
        UncaughtExceptionGracefulShutdownState,
    UncaughtExceptionPostGracefulShutdownState:
        UncaughtExceptionPostGracefulShutdownState,
    UncaughtExceptionPreStatsdState:
        UncaughtExceptionPreStatsdState,
    UncaughtExceptionStatsdState:
        UncaughtExceptionStatsdState,
    UncaughtExceptionPostStatsdState:
        UncaughtExceptionPostStatsdState,
    UncaughtExceptionStruct:
        UncaughtExceptionStruct
};

module.exports = UncaughtMemoryReporter;

function UncaughtExceptionStruct(stateMachine, states) {
    this.stateMachine = stateMachine;
    this.states = states;
}

function UncaughtExceptionStateMachine() {
    this.configValue = null;
    this.uncaughtError = null;
    this.currentStack = null;

    this.transitions = [];
    this.states = {};
    this.markedTransitions = [];
}

UncaughtExceptionStateMachine.prototype.addTransition =
function addTransition(transition) {
    this.transitions.push(transition);
    this.states[transition.stateName] = transition;
};

UncaughtExceptionStateMachine.prototype.markTransition =
function markTransition(currentState) {
    this.markedTransitions.push(currentState);
};

function UncaughtExceptionConfigValue(opts) {
    this.meta = opts.meta;
    this.statsdKey = opts.statsdKey;
    this.backupFile = opts.backupFile;
    this.loggerTimeout = opts.loggerTimeout;
    this.statsdTimeout = opts.statsdTimeout;
    this.shutdownTimeout = opts.shutdownTimeout;
    this.statsdWaitPeriod = opts.statsdWaitPeriod;
    this.hasGracefulShutdown = opts.hasGracefulShutdown;
    this.hasPreAbort = opts.hasPreAbort;
    this.hasFakeFS = opts.hasFakeFS;
    this.hasFakeSetTimeout = opts.hasFakeSetTimeout;
    this.hasFakeClearTimeout = opts.hasFakeClearTimeout;
}

function UncaughtExceptionPreLoggingErrorState(opts) {
    this.stateName = Constants.PRE_LOGGING_ERROR_STATE;
    this.currentState = opts.currentState;
    this.currentDomain = opts.currentDomain;
    this.timerHandle = opts.timerHandle;
}

function UncaughtExceptionLoggingErrorState(opts) {
    this.stateName = Constants.LOGGING_ERROR_STATE;
    this.currentState = opts.currentState;
    this.backupFileLine = opts.backupFileLine;
    this.loggerError = opts.loggerError;
}

function UncaughtExceptionPostLoggingErrorState(opts) {
    this.stateName = Constants.POST_LOGGING_ERROR_STATE;
    this.currentState = opts.currentState;
    this.loggerAsyncError = opts.loggerAsyncError;
    this.backupFileUncaughtErrorLine = opts.backupFileUncaughtErrorLine;
    this.backupFileLoggerErrorLine = opts.backupFileLoggerErrorLine;
}

function UncaughtExceptionPreGracefulShutdownState(opts) {
    this.stateName = Constants.PRE_GRACEFUL_SHUTDOWN_STATE;
    this.currentState = opts.currentState;
    this.shutdownTimer = opts.shutdownTimer;
}

function UncaughtExceptionGracefulShutdownState(opts) {
    this.stateName = Constants.GRACEFUL_SHUTDOWN_STATE;
    this.currentState = opts.currentState;
    this.shutdownError = opts.shutdownError;
}

function UncaughtExceptionPostGracefulShutdownState(opts) {
    this.stateName = Constants.POST_GRACEFUL_SHUTDOWN_STATE;
    this.currentState = opts.currentState;
    this.gracefulShutdownError = opts.gracefulShutdownError;
    this.backupFileUncaughtErrorLine = opts.backupFileUncaughtErrorLine;
    this.backupFileShutdownErrorLine = opts.backupFileShutdownErrorLine;
}

function UncaughtExceptionPreStatsdState(opts) {
    this.stateName = Constants.PRE_STATSD_STATE;
    this.currentState = opts.currentState;
    this.statsdTimer = opts.statsdTimer;
}

function UncaughtExceptionStatsdState(opts) {
    this.stateName = Constants.STATSD_STATE;
    this.currentState = opts.currentState;
    this.statsdError = opts.statsdError;
}

function UncaughtExceptionPostStatsdState(opts) {
    this.stateName = Constants.POST_STATSD_STATE;
    this.currentState = opts.currentState;
    this.statsdError = opts.statsdError;
    this.backupFileUncaughtErrorLine = opts.backupFileUncaughtErrorLine;
    this.backupFileStatsdErrorLine = opts.backupFileStatsdErrorLine;
}

function UncaughtMemoryReporter() {
    var self = this;

    self.configValue = null;
}

UncaughtMemoryReporter.prototype.reportConfig =
function reportConfig(uncaught) {
    var self = this;

    self.configValue = new structures.UncaughtExceptionConfigValue({
        meta: uncaught.meta,
        statsdKey: uncaught.statsdKey,
        backupFile: uncaught.backupFile,
        loggerTimeout: uncaught.loggerTimeout,
        statsdTimeout: uncaught.statsdTimeout,
        shutdownTimeout: uncaught.shutdownTimeout,
        statsdWaitPeriod: uncaught.statsdWaitPeriod,
        hasGracefulShutdown: !!uncaught.options.gracefulShutdown,
        hasPreAbort: !!uncaught.options.preAbort,
        hasFakeFS: !!uncaught.options.fs,
        hasFakeSetTimeout: !!uncaught.options.setTimeout,
        hasFakeClearTimeout: !!uncaught.options.clearTimeout
    });
};

UncaughtMemoryReporter.prototype.createStateMachine =
function createStateMachine(error) {
    var self = this;
    var type = error.type || '';

    var stateMachine = new structures.UncaughtExceptionStateMachine();
    stateMachine.configValue = self.configValue;
    stateMachine.uncaughtError = error;
    stateMachine.uncaughtErrorType = type;
    stateMachine.currentStack = new Error('empty').stack;
    ALL_STATES.push(stateMachine);

    return stateMachine;
};

UncaughtMemoryReporter.prototype.markTransition =
function markTransition(handler) {
    handler.stateMachine.markTransition(handler.currentState);
};

UncaughtMemoryReporter.prototype.reportPreLogging =
function reportPreLogging(handler) {
    handler.stateMachine.addTransition(
        new structures.UncaughtExceptionPreLoggingErrorState({
            currentState: handler.currentState,
            currentDomain: handler.currentDomain,
            timerHandle: handler.timerHandles.logger
        })
    );
};

UncaughtMemoryReporter.prototype.reportLogging =
function reportLogging(handler) {
    var lines = handler.backupLog.lines;

    handler.stateMachine.addTransition(
        new structures.UncaughtExceptionLoggingErrorState({
            backupFileLine: lines['exception.occurred'],
            currentState: handler.currentState,
            loggerError: handler.loggerError
        })
    );
};

UncaughtMemoryReporter.prototype.reportPostLogging =
function reportPostLogging(handler) {
    var lines = handler.backupLog.lines;

    handler.stateMachine.addTransition(
        new structures.UncaughtExceptionPostLoggingErrorState({
            currentState: handler.currentState,
            loggerAsyncError: handler.loggerAsyncError,
            backupFileUncaughtErrorLine: lines['logger.uncaught.exception'],
            backupFileLoggerErrorLine: lines['logger.failure']
        })
    );
};

UncaughtMemoryReporter.prototype.reportPreStatsd =
function reportPostLogging(handler) {
    handler.stateMachine.addTransition(
        new structures.UncaughtExceptionPreStatsdState({
            currentState: handler.currentState,
            currentDomain: handler.currentDomain,
            statsdTimer: handler.timerHandles.statsd
        })
    );
};

UncaughtMemoryReporter.prototype.reportStatsd =
function reportStatsd(handler) {
    handler.stateMachine.addTransition(
        new structures.UncaughtExceptionStatsdState({
            currentState: handler.currentState,
            statsdError: handler.statsdError
        })
    );
};

UncaughtMemoryReporter.prototype.reportPostStatsd =
function reportPostStatsd(handler) {
    var lines = handler.backupLog.lines;

    handler.stateMachine.addTransition(
        new structures.UncaughtExceptionPostStatsdState({
            currentState: handler.currentState,
            statsdError: handler.statsdAsyncError,
            backupFileUncaughtErrorLine: lines['statsd.uncaught.exception'],
            backupFileStatsdErrorLine: lines['statsd.failure']
        })
    );
};

UncaughtMemoryReporter.prototype.reportPreGracefulShutdown =
function reportPreGracefulShutdown(handler) {
    handler.stateMachine.addTransition(
        new structures.UncaughtExceptionPreGracefulShutdownState({
            currentState: handler.currentState,
            shutdownTimer: handler.timerHandles.shutdown
        })
    );
};

UncaughtMemoryReporter.prototype.reportShutdown =
function reportShutdown(handler) {
    handler.stateMachine.addTransition(
        new structures.UncaughtExceptionGracefulShutdownState({
            currentState: handler.currentState,
            shutdownError: handler.shutdownError
        })
    );
};

UncaughtMemoryReporter.prototype.reportPostGracefulShutdown =
function reportPostGracefulShutdown(handler) {
    var lines = handler.backupLog.lines;

    handler.stateMachine.addTransition(
        new structures.UncaughtExceptionPostGracefulShutdownState({
            currentState: handler.currentState,
            gracefulShutdownError: handler.shutdownAsyncError,
            backupFileUncaughtErrorLine: lines['shutdown.uncaught.exception'],
            backupFileShutdownErrorLine: lines['shutdown.failure']
        })
    );
};

UncaughtMemoryReporter.prototype.getAllState =
function getAllState(handler) {
    return new structures.UncaughtExceptionStruct(
        handler.stateMachine, ALL_STATES
    );
};
