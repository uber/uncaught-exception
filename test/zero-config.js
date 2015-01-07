var path = require('path');
var fs = require('fs');
var os = require('os');
var process = require('process');
var cuid = require('cuid');
var test = require('assert-tap').test;
var zeroConf = require('zero-config');
var extend = require('xtend');

var uncaught = require('../zero-config.js');

test('can create uncaught', function t(assert) {
    var onError = createUncaught();

    assert.equal(typeof onError, 'function');

    assert.end();
});

test('uncaught throws without logger', function t(assert) {
    var config = zeroConf(__dirname, {
        seed: {}
    });

    var clients = {};

    assert.throws(function throwIt() {
        uncaught(config, clients);
    }, /You must pass a `clients.logger`/);
    assert.end();
});

test('uncaught throws without backupFile', function t(assert) {
    var config = zeroConf(__dirname, {
        seed: {}
    });

    var clients = { logger: {} };

    assert.throws(function throwIt() {
        uncaught(config, clients);
    }, /the options.backupFile parameter should be a string/);
    assert.end();
});

test('uncaught uses the prefix', function t(assert) {
    var onError = createUncaught({
        env: { NODE_ENV: 'development' },
        config: { project: 'demo' }
    });
    var logs = onError.logs;

    var err = new Error('hello');
    onError(err);

    assert.equal(logs.length, 1);
    assert.ok(logs[0].msg.indexOf('demo.development.') === 0);
    assert.ok(logs[0].msg.indexOf('Uncaught Exception') > 0);

    assert.end();
});

test('uncaught writes to the logger', function t(assert) {
    var onError = createUncaught();
    var logs = onError.logs;

    var err = new Error('hello');
    onError(err);

    assert.equal(logs.length, 1);
    assert.ok(logs[0].msg.indexOf('Uncaught Exception') > -1);
    assert.equal(logs[0].meta, err);
    assert.equal(logs[0].meta.message, err.message);

    onError.destroy();
    assert.end();
});

test('uncaught writes to the backupFile', function t(assert) {
    var onError = createUncaught();

    var err = new Error('hello');
    onError(err);

    fs.readFile(onError.backupFile, function onFile(err2, file) {
        assert.ifError(err2);

        file = String(file);
        var lines = file.split('\n').filter(Boolean);

        var record = JSON.parse(lines[0]);
        assert.equal(lines.length, 1);
        assert.equal(record.message, 'hello');
        assert.equal(record._uncaughtType, 'exception.occurred');
        assert.ok(record.stack.indexOf('Error: hello') > -1);

        assert.end();
    });
});

test('uncaught respects a loggerTimeout', function t(assert) {
    var onError = createUncaught({
        config: {
            'clients': {
                'uncaught-exception': {
                    loggerTimeout: 51
                }
            }
        }
    });

    var err = new Error('hello');
    onError(err);

    assert.equal(onError.timers.length, 1);
    assert.equal(onError.timers[0], 51);

    assert.end();
});

test('uncaught respects a shutdownTimeout', function t(assert) {
    var onError = createUncaught({
        config: {
            'clients': {
                'uncaught-exception': {
                    shutdownTimeout: 51
                }
            }
        }
    });

    var err = new Error('hello');
    onError(err);

    process.nextTick(function onTick() {
        assert.equal(onError.timers.length, 2);
        assert.equal(onError.timers[1], 51);

        assert.end();
    });
});

test('uncaught without options', function t(assert) {
    var config = allocConfig();
    var logs = [];
    var clients = {
        logger: {
            fatal: function logFatal(msg, meta) {
                logs.push({ msg: msg, meta: meta });

                // do not call callback.
                // cb();
            }
        }
    };

    var onError = uncaught(config, clients, function onOpen() {
        assert.equal(typeof onError, 'function');

        assert.end();
    });
});

/*
    interfaces.

     - async mutable. Takes config, clients, cb.
        calls cb with no args or error
        mutates clients object.
     - sync return. takes config, returns the client
     - old sync return. takes config & clients, returns the
        client.
     - old async interface. Takes config, clients, cb.
        Calls cb with no args or error
        returns the client
*/
test('uncaught respects async mutable interface', function t(assert) {
    var config = allocConfig();
    var clients = { logger: allocLogger() };
    var options = allocOptions();

    uncaught(config, clients, options, function onOpen() {
        assert.equal(typeof clients.onError, 'function');

        var err = new Error('yolo');
        clients.onError(err);

        var logs = clients.logger.logs;
        assert.equal(logs.length, 1);
        assert.equal(logs[0].meta.message, 'yolo');

        assert.end();
    });
});

test('uncaught respects the sync return interface', function t(assert) {
    var config = allocConfig();
    var clients = { logger: allocLogger() };
    var options = allocOptions();

    var onError = uncaught(config, clients, options);

    assert.equal(typeof onError, 'function');

    var err = new Error('yolo');
    onError(err);

    var logs = clients.logger.logs;
    assert.equal(logs.length, 1);
    assert.equal(logs[0].meta.message, 'yolo');

    assert.end();
});

test('uncaught respects the old sync return interface', function t(assert) {
    var config = allocConfig();
    var clients = { logger: allocLogger() };
    var options = allocOptions();

    var onError = uncaught(config, clients, options);

    assert.equal(typeof onError, 'function');

    var err = new Error('yolo');
    onError(err);

    var logs = clients.logger.logs;
    assert.equal(logs.length, 1);
    assert.equal(logs[0].meta.message, 'yolo');

    assert.end();
});

test('uncaught respects the old async interface', function t(assert) {
    var config = allocConfig();
    var clients = { logger: allocLogger() };
    var options = allocOptions();

    var onError = uncaught(config, clients, options, function onOpen() {
        assert.equal(typeof onError, 'function');

        var err = new Error('yolo');
        onError(err);

        var logs = clients.logger.logs;
        assert.equal(logs.length, 1);
        assert.equal(logs[0].meta.message, 'yolo');

        assert.end();
    });
});

function allocOptions(opts) {
    opts = opts || {};

    var timers = [];
    return {
        gracefulShutdown: function gracefulShutdown() {
            // we don't want to shutdown at all
        },
        timers: timers,
        env: opts.env,
        setTimeout: function setTimeout(fn, timer) {
            // fake timeouts do nothing. This is really bad.
            // it avoids invoking `process.abort()` in the
            // source code.
            timers.push(timer);

            // must return a number
            return 1;
        }
    };
}

function allocUncaught(opts) {
    opts = opts || {};

    var config = opts.config;
    var clients = { logger: opts.logger };
    var options = allocOptions(opts);
    uncaught(config, clients, options);
    clients.onError.destroy = function fakeDestroy() {
        // really bad. bust out of the domain to avoid abort();
        if (process.domain) {
            process.domain.exit();
        }
    };
    clients.onError.timers = options.timers;

    return clients.onError;
}

function allocLogger() {
    var logs = [];
    return {
        logs: logs,
        fatal: function onFatal(msg, meta, cb) {
            logs.push({ msg: msg, meta: meta });
            cb();
        }
    };
}

function allocConfig(opts) {
    opts = opts || {};
    var fPath = path.join(os.tmpDir(),
        'uncaught-exception-' + cuid());

    var seedConfig = extend({
        'clients': {
            'uncaught-exception': {
                backupFile: fPath
            }
        }
    }, opts.config || {});

    if (!seedConfig.clients['uncaught-exception'].backupFile) {
        seedConfig.clients['uncaught-exception'].backupFile = fPath;
    }

    var config = zeroConf(__dirname, {
        seed: seedConfig
    });
    config.fPath = fPath;
    return config;
}

function createUncaught(opts) {
    opts = opts || {};

    var logger = allocLogger(opts);
    var config = allocConfig(opts);

    var onError = allocUncaught({
        config: config,
        env: opts.env,
        setTimeout: opts.setTimeout,
        logger: logger
    });
    onError.backupFile = config.fPath;
    onError.logs = logger.logs;

    return onError;
}
