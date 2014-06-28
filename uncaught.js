var globalFs = require('fs');
var TypedError = require('error/typed');

var LoggerRequired = TypedError({
    type: 'uncaught-exception.logger.required',
    message: 'uncaught-exception: the options.logger ' +
        'parameter is required.\n' +
        'Please call `uncaught({ logger: logger })`.\n'
});

module.exports = uncaught;

function uncaught(options) {
    if (!options || !options.logger) {
        throw LoggerRequired({
            logger: options && options.logger
        });
    }

    var logger = options.logger;
    var fs = options.fs || globalFs;
    var prefix = options.prefix ? options.prefix + ' ' : '';
    var backupFile = options.backupFile || false;
    var gracefulShutdown = options.gracefulShutdown || asyncNoop;

    return uncaughtListener;

    function uncaughtListener(error) {
        var type = error.type || '';
        logger.fatal(prefix + 'Uncaught Exception: ' + type,
            error, onlogged);

        function onlogged(err) {
            if (err && backupFile) {
                var str = stringifyError(error);
                fs.appendFileSync(backupFile, str);
            }

            gracefulShutdown(onshutdown);
        }
    }

    function onshutdown(err) {
        if (err && backupFile) {
            var str = stringifyError(err);
            fs.appendFileSync(backupFile, str);
        }

        process.abort();
    }
}

function asyncNoop(cb) {
    process.nextTick(cb);
}

function stringifyError(error) {
    return JSON.stringify({
        message: error.message,
        type: error.type,
        stack: error.stack
    });
}
