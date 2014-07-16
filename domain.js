var util = require('util');
var domain;

// see https://github.com/joyent/node/blob/v0.8.8-release/lib/domain.js#L53
function emitError(currentDomain, err) {
    /*jshint camelcase: false*/
    util._extend(err, {
        domain: currentDomain,
        domain_thrown: true
    });
    currentDomain.emit('error', err);
    currentDomain.exit();
}

function run(currentDomain, onRun) {
    // add try catch. This gives us node 0.10 domain semantics
    // the unit tests expect throw errors to bubble into the domain.
    try {
        currentDomain.run(onRun);
    } catch (err) {
        emitError(currentDomain, err);
    }
}

function domainHandler(opts) {
    function runInDomain(emitters, handleError, onRun) {
        var d = domain.create();
        emitters.forEach(function (emitter) {
            d.add(emitter);
        });

        d.on('error', function (err) {
            handleError(err, d);
        });

        // DISABLED by default. Try catch means it would not go to uncaught 
        // error handler. Async thrown errors go to the uncaught handler.
        // let's have sync thrown errors also go to the uncaught handler.
        if (opts.tryCatch) {
            run(d, onRun);
        } else {
            d.run(onRun);
        }
    }

    if (!domain) {
        // lazy require domain. not doing so is a perf issue
        domain = require('domain');
    }

    opts = opts || {};

    return runInDomain;
}

module.exports = domainHandler;
