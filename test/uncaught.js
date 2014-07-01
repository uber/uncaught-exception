// cannot use tape because it adds uncaughtException listeners
var test = require('assert-tap').test;
var process = require('process');
var FakeFs = require('fake-fs');
var Timer = require('time-mock');

var tryCatch = require('../lib/try-catch-it.js');
var uncaughtException = require('../uncaught.js');

function getListener() {
    return process.listeners('uncaughtException');
}

function uncaught(opts) {
    if (!opts.gracefulShutdown) {
        opts.gracefulShutdown = function gracefulShutdown() {
            // we don't want to abort in a test
        };
    }

    if (!opts.setTimeout) {
        opts.setTimeout = function setTimeout() {
            // fake timeouts to do nothing. This is really
            // bad it avoids invoking the process.abort()
            // in the source code

            // must return a number
            return 1;
        };
    }

    var onError = uncaughtException(opts);
    process.on('uncaughtException', onError);

    return remove;

    function remove() {
        process.removeListener('uncaughtException', onError);
        // bust out of the domain to avoid abort();
        if (process.domain) {
            process.domain.exit();
        }
    }
}

test('uncaughtException is a function', function t(assert) {
    assert.equal(typeof uncaughtException, 'function');
    assert.end();
});

test('uncaughtException with listener disabled does nothing',
    function t(assert) {
        var onError = uncaughtException({
            logger: { fatal: function f() {} }
        });

        assert.equal(typeof onError, 'function');

        var ls = getListener();
        assert.equal(ls.length, 0);

        assert.end();
    });

test('uncaughtException adds a listener', function t(assert) {
    var remove = uncaught({
        logger: { fatal: function f() {} }
    });

    var ls = getListener();
    assert.equal(ls.length, 1);

    remove();
    assert.end();
});

test('uncaughtException logs to logger', function t(assert) {
    var logger = {
        fatal: function fatal(message, error) {
            assert.equal(message, 'Uncaught Exception: ');
            assert.ok(error);
            assert.ok(error.stack);
            assert.equal(error.message, 'test error');

            remove();
            assert.end();
        }
    };

    var remove = uncaught({
        logger: logger
    });

    process.nextTick(function throwIt() {
        throw new Error('test error');
    });
});

test('uncaughtException prefix', function t(assert) {
    var logger = {
        fatal: function fatal(message, error) {
            assert.equal(message,
                'some-server: Uncaught Exception: ');
            assert.ok(error);
            assert.ok(error.stack);
            assert.equal(error.message, 'error test');

            remove();
            assert.end();
        }
    };

    var remove = uncaught({
        logger: logger,
        prefix: 'some-server: '
    });

    process.nextTick(function throwIt() {
        throw new Error('error test');
    });
});

test('writes to backupFile on error', function t(assert) {
    var logger = {
        fatal: function fatal(message, error, cb) {
            cb(new Error('cant log'));

            var bool = fs.existsSync('/foo/bar');
            assert.equal(bool, true);

            var content = fs.readFileSync('/foo/bar', 'utf8');
            var lines = content.trim().split('\n');

            assert.equal(lines.length, 2);

            var line1 = JSON.parse(lines[0]);
            assert.equal(line1.message, 'error test');
            assert.ok(line1.stack);

            var line2 = JSON.parse(lines[1]);
            assert.equal(line2.message, 'cant log');
            assert.ok(line2.stack);

            remove();
            assert.end();
        }
    };
    var fs = FakeFs();
    fs.dir('/foo');

    var remove = uncaught({
        logger: logger,
        fs: fs,
        backupFile: '/foo/bar'
    });

    process.nextTick(function throwIt() {
        throw new Error('error test');
    });
});

test('does not write undefined backupFile', function t(assert) {
    var logger = {
        fatal: function fatal(message, error, cb) {
            cb(new Error('oops'));

            var folders = fs.readdirSync('/');
            assert.equal(folders.length, 0);

            remove();
            assert.end();
        }
    };

    var fs = FakeFs();

    var remove = uncaught({
        logger: logger,
        fs: fs
    });

    process.nextTick(function throwIt() {
        throw new Error('test error');
    });
});

test('handles disk failures', function t(assert) {
    var logger = {
        fatal: function fatal(message, error, cb) {
            cb(new Error('logger error'));
        }
    };

    var fs = FakeFs();

    var remove = uncaught({
        logger: logger,
        fs: fs,
        backupFile: '/foo/bar',
        gracefulShutdown: function shutIt() {
            assert.ok(true);

            remove();
            assert.end();
        }
    });

    process.nextTick(function throwIt() {
        throw new Error('error test');
    });
});

test('handles timeout for logger', function t(assert) {
    var logger = {
        fatal: function fatal() {
            // do nothing. simulate a timeout

            // fast forward 30 seconds
            timer.advance(30000);
        }
    };

    var fs = FakeFs();
    fs.dir('/foo');
    var timer = Timer(0);

    var remove = uncaught({
        logger: logger,
        setTimeout: timer.setTimeout,
        clearTimeout: timer.clearTimeout,
        fs: fs,
        backupFile: '/foo/bar',
        gracefulShutdown: function shutIt() {
            assert.ok(true);

            assert.ok(fs.existsSync('/foo/bar'));

            var buf = fs.readFileSync('/foo/bar');
            var lines = String(buf).trim().split('\n');

            assert.equal(lines.length, 2);

            var line1 = JSON.parse(lines[0]);
            var line2 = JSON.parse(lines[1]);

            assert.equal(line1.message, 'timeout error');
            assert.equal(line1._uncaughtType,
                'uncaught.exception');

            assert.equal(line2.type,
                'uncaught-exception.logger.timeout');
            assert.equal(line2._uncaughtType,
                'logger.failure');

            remove();
            assert.end();
        }
    });

    process.nextTick(function throwIt() {
        throw new Error('timeout error');
    });
});

test('handles exceptions for logger', function t(assert) {
    var logger = {
        fatal: function fatal() {
            // simulate a bug
            throw new Error('bug in logger implementation');
        }
    };

    var fs = FakeFs();
    fs.dir('/foo');

    var remove = uncaught({
        logger: logger,
        fs: fs,
        backupFile: '/foo/bar',
        gracefulShutdown: function shutIt() {
            assert.ok(true);

            assert.ok(fs.existsSync('/foo/bar'));

            var buf = fs.readFileSync('/foo/bar');
            var lines = String(buf).trim().split('\n');

            assert.equal(lines.length, 2);

            var line1 = JSON.parse(lines[0]);
            var line2 = JSON.parse(lines[1]);

            assert.equal(line1.message, 'exception error');
            assert.equal(line1._uncaughtType,
                'uncaught.exception');

            assert.equal(line2.type,
                'uncaught-exception.logger.threw');
            assert.equal(line2._uncaughtType,
                'logger.failure');

            remove();
            assert.end();
        }
    });

    process.nextTick(function throwIt() {
        throw new Error('exception error');
    });
});

test('handles custom timeout', function t(assert) {
    var timeout = 500;
    var logger = {
        fatal: function fatal() {
            // do nothing. simulate a timeout

            // fast forward 500 ms
            timer.advance(timeout);
        }
    };

    var timer = Timer(0);

    var remove = uncaught({
        logger: logger,
        setTimeout: timer.setTimeout,
        clearTimeout: timer.clearTimeout,
        loggerTimeout: timeout,
        gracefulShutdown: function shutIt() {
            assert.ok(true);

            remove();
            assert.end();
        }
    });

    process.nextTick(function throwIt() {
        throw new Error('timeout error');
    });
});

test('throws exception without options', function t(assert) {
    var tuple = tryCatch(function throwIt() {
        uncaughtException();
    });

    assert.ok(tuple[0]);
    assert.equal(tuple[0].type,
        'uncaught-exception.logger.required');

    var tuple2 = tryCatch(function throwIt() {
        uncaughtException({});
    });

    assert.ok(tuple2[0]);
    assert.equal(tuple2[0].type,
        'uncaught-exception.logger.required');

    var tuple3 = tryCatch(function throwIt() {
        uncaughtException({
            logger: { error: function e() {} }
        });
    });

    assert.ok(tuple3[0]);
    assert.equal(tuple3[0].type,
        'uncaught-exception.logger.methodsRequired');

    assert.end();
});
