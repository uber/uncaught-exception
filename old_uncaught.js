function uncaughtExceptionHandler(opts) {
    function onError(err) {
        // if we want to crash on exception then wait for sending a message
        // to raven and logger. Then remove listener & rethrow.
        // node will crash the process like it normally does for thrown errors
        function shutdown() {
            // crashOnException should not be optional. It should always
            // happen.
            // https://github.com/joyent/node/issues/2582
            // there is zero garantuee you can even log to logger in 
            // undefined state. This process needs to die hard, 
            // not killing it leads to cascading failures & disaster porn.
            // http://www.infoq.com/presentations/Debugging-Production-Systems
            if (opts.crashOnException !== false) {
                process.removeListener('uncaughtException', onError);
                throw err;
            }
        }

        function next(loggingError) {
            if (!loggingError || !logger) {
                return shutdown();
            }

            var subject = (opts.scope ? opts.scope + ' ' : '') +
                serviceName + ' - ' + ' Uncaught Exception';

            logger.error('Uncaught exception:\n' + err.stack, {
                subject: subject
            }, shutdown);
        }

        if (err.uncaughtExceptionHandled) {
            return;
        }

        // node 0.8.8 domains have edge cases in them where it may call
        // the uncaughtException listener multiple times with the same
        // error. This should go away in 0.10 or 0.12
        err.uncaughtExceptionHandled = true;

        if (opts.verbose) {
            if (opts.logError) {
                opts.logError(err, next);
            } else {
                next(true);
            }
        } else if (logger) {
            logger.error('uncaught err = ' + err.message,
                err.stack, shutdown);
        } else {
            shutdown();
        }
    }

    opts = opts || {};
    var logger = opts.logger;
    var serviceName = opts.serviceName || 'unknown service';

    return onError;
}

module.exports = uncaughtExceptionHandler;
