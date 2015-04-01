'use strict';

/*

This contains a set of data structures designed for being easily
found when debugging a core dump

*/

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
    UncaughtExceptionPreGracefulShutdownState:
        UncaughtExceptionPreGracefulShutdownState,
    UncaughtExceptionGracefulShutdownState:
        UncaughtExceptionGracefulShutdownState,
    UncaughtExceptionPostGracefulShutdownState:
        UncaughtExceptionPostGracefulShutdownState,
    UncaughtExceptionStruct:
        UncaughtExceptionStruct
};

module.exports = structures;

function UncaughtExceptionStruct(stateMachine, states) {
    this.stateMachine = stateMachine;
    this.states = states;
}

function UncaughtExceptionStateMachine() {
    this.configValue = null;
    this.uncaughtError = null;

    this.transitions = [];
    this.states = {};
}

UncaughtExceptionStateMachine.prototype.addTransition =
function addTransition(transition) {
    this.transitions.push(transition);
    this.states[transition.stateName] = transition;
};

function UncaughtExceptionConfigValue(opts) {
    this.prefix = opts.prefix;
    this.backupFile = opts.backupFile;
    this.loggerTimeout = opts.loggerTimeout;
    this.shutdownTimeout = opts.shutdownTimeout;
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

function UncaughtExceptionPreGracefulShutdownState(opts) {
    this.stateName = Constants.PRE_GRACEFUL_SHUTDOWN_STATE;
    this.currentState = opts.currentState;
    this.fatalLoggingError = opts.fatalLoggingError;
    this.backupFileUncaughtErrorLine = opts.backupFileUncaughtErrorLine;
    this.backupFileLoggerErrorLine = opts.backupFileLoggerErrorLine;
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
