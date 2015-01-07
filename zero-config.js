var os = require('os');
var process = require('process');
var extend = require('xtend');
var uncaught = require('./uncaught.js');
var TypedError = require('error/typed');

var LoggerRequiredError = TypedError({
    type: 'playdoh-clients.uncaught.logger-required',
    message: 'You must pass a `clients.logger` to ' +
        '`createUncaught()`.\n' +
        'Ensure that you create your logger before you ' +
        'create your uncaught exception handler.\n' +
        'SUGGESTED FIX: call `createUncaught(config, ' +
            '{ logger: someLogger })`.\n'
});

module.exports = createUncaught;

function createUncaught(config, clients, options, cb) {
    if (typeof options === 'function') {
        cb = options;
        options = {};
    }

    options = options || {};
    var conf = config.get('clients.uncaught-exception') || {};
    if (cb) {
        process.nextTick(cb);
    }

    if (!clients.logger) {
        throw LoggerRequiredError();
    }

    clients.onError = uncaught(extend(options, {
        logger: clients.logger,
        prefix: [
            config.get('project'),
            /*eslint-disable*/
            (options.env || process.env).NODE_ENV,
            /*eslint-enable*/
            os.hostname().split('.')[0]
        ].join('.') + ' ',
        backupFile: conf.backupFile,
        loggerTimeout: conf.loggerTimeout,
        shutdownTimeout: conf.shutdownTimeout,
        gracefulShutdown: options.gracefulShutdown
    }));
    return clients.onError;
}
