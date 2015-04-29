'use strict';

var test = require('tape');
var process = require('process');
var FakeFs = require('fake-fs');
var Timer = require('time-mock');

var tryCatch = require('../lib/try-catch-it.js');
var EventReporter = require('./lib/event-reporter.js');
var uncaughtException = require('../uncaught.js');

function getListener() {
    return process.listeners('uncaughtException');
}

function uncaught(opts) {
    if (!opts.statsd) {
        opts.statsd = {
            immediateIncrement: function immediateIncrement(key, n, cb) {
                cb(null);
            }
        };
    }

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
            logger: {
                fatal: function f() {
                    assert.ok(false, 'fatal() should not be called');
                }
            },
            statsd: {
                immediateIncrement: function f() {
                    assert.ok(false,
                        'immediateIncrement() should not be called');
                }
            }
        });

        assert.equal(typeof onError, 'function');

        var ls = getListener();
        assert.equal(ls.length, 0);

        assert.end();
    });

test('uncaughtException adds a listener', function t(assert) {
    var remove = uncaught({
        logger: {
            fatal: function f() {
                assert.ok(false, 'fatal() should not be called');
            }
        }
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
        }
    };
    var fs = FakeFs();
    var reporter = EventReporter();
    fs.dir('/foo');

    var remove = uncaught({
        logger: logger,
        reporter: reporter,
        fs: fs,
        backupFile: '/foo/bar'
    });

    reporter.once('reportPostLogging', function onEvent() {
        var bool = fs.existsSync('/foo/bar');
        assert.equal(bool, true);

        var content = fs.readFileSync('/foo/bar', 'utf8');
        var lines = content.trim().split('\n');

        assert.equal(lines.length, 3);

        var line1 = JSON.parse(lines[0]);
        assert.equal(line1.message, 'error test');
        assert.ok(line1.stack);

        var line2 = JSON.parse(lines[1]);
        assert.equal(line2.message, 'error test');
        assert.ok(line2.stack);

        var line3 = JSON.parse(lines[2]);
        assert.equal(line3.message, 'cant log');
        assert.ok(line3.stack);

        remove();
        assert.end();
    });

    process.nextTick(function throwIt() {
        throw new Error('error test');
    });
});

test('calls gracefulShutdown', function t(assert) {
    var logger = {
        fatal: function fatal(message, error, cb) {
            cb(null);
        }
    };
    var fs = FakeFs();
    var reporter = EventReporter();
    fs.dir('/foo');

    var remove = uncaught({
        logger: logger,
        reporter: reporter,
        gracefulShutdown: function graceful() {
            var bool = fs.existsSync('/foo/bar');
            assert.equal(bool, true);

            var content = fs.readFileSync('/foo/bar', 'utf8');
            var lines = content.trim().split('\n');

            assert.equal(lines.length, 1);

            var line1 = JSON.parse(lines[0]);
            assert.equal(line1.message, 'error test');
            assert.ok(line1.stack);

            remove();
            assert.end();
        },
        abortOnUncaught: true,
        fs: fs,
        backupFile: '/foo/bar'
    });

    process.nextTick(function throwIt() {
        throw new Error('error test');
    });
});

test('does not write undefined backupFile', function t(assert) {
    var logger = {
        fatal: fatal
    };

    var fs = FakeFs();

    var remove = uncaught({
        logger: logger,
        fs: fs
    });

    process.nextTick(function throwIt() {
        throw new Error('test error');
    });

    function fatal(message, error, cb) {
        cb(new Error('oops'));

        var folders = fs.readdirSync('/');
        assert.equal(folders.length, 0);

        remove();
        assert.end();
    }
});

test('handles disk failures', function t(assert) {
    var logger = {
        fatal: function fatal(message, error, cb) {
            cb(new Error('logger error'));
        }
    };

    var fs = FakeFs();
    var reporter = EventReporter();

    var remove = uncaught({
        logger: logger,
        fs: fs,
        reporter: reporter,
        backupFile: '/foo/bar'
    });

    reporter.once('reportPostLogging', function onEvent() {
        assert.ok(true);

        var folders = fs.readdirSync('/');
        assert.equal(folders.length, 0);

        remove();
        assert.end();
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
    var reporter = EventReporter();

    var remove = uncaught({
        logger: logger,
        setTimeout: timer.setTimeout,
        clearTimeout: timer.clearTimeout,
        fs: fs,
        reporter: reporter,
        backupFile: '/foo/bar'
    });

    reporter.once('reportPostLogging', function onEvent() {
        assert.ok(true);

        assert.ok(fs.existsSync('/foo/bar'));

        var buf = fs.readFileSync('/foo/bar');
        var lines = String(buf).trim().split('\n');

        assert.equal(lines.length, 3);

        var line1 = JSON.parse(lines[0]);
        var line2 = JSON.parse(lines[1]);
        var line3 = JSON.parse(lines[2]);

        assert.equal(line1.message, 'timeout error');
        assert.equal(line1._uncaughtType,
            'exception.occurred');

        assert.equal(line2.message, 'timeout error');
        assert.equal(line2._uncaughtType,
            'logger.uncaught.exception');

        assert.equal(line3.type,
            'uncaught-exception.logger.timeout');
        assert.equal(line3._uncaughtType,
            'logger.failure');

        remove();
        assert.end();
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
    var reporter = EventReporter();

    var remove = uncaught({
        logger: logger,
        fs: fs,
        reporter: reporter,
        backupFile: '/foo/bar'
    });

    reporter.once('reportPostLogging', function onEvent() {
        assert.ok(true);

        assert.ok(fs.existsSync('/foo/bar'));

        var buf = fs.readFileSync('/foo/bar');
        var lines = String(buf).trim().split('\n');

        assert.equal(lines.length, 3);

        var line1 = JSON.parse(lines[0]);
        var line2 = JSON.parse(lines[1]);
        var line3 = JSON.parse(lines[2]);

        assert.equal(line1.message, 'exception error');
        assert.equal(line1._uncaughtType,
            'exception.occurred');

        assert.equal(line2.message, 'exception error');
        assert.equal(line2._uncaughtType,
            'logger.uncaught.exception');

        assert.equal(line3.type,
            'uncaught-exception.logger.threw');
        assert.equal(line3._uncaughtType,
            'logger.failure');

        remove();
        assert.end();
    });

    process.nextTick(function throwIt() {
        throw new Error('exception error');
    });
});

test('handles async exceptions for logger', function t(assert) {
    var logger = {
        fatal: function fatal() {
            // simulate a bug
            process.nextTick(function throwIt() {
                throw new Error('bug in logger implementation');
            });
        }
    };

    var fs = FakeFs();
    fs.dir('/foo');
    var reporter = new EventReporter();

    var remove = uncaught({
        logger: logger,
        fs: fs,
        reporter: reporter,
        backupFile: '/foo/bar'
    });

    reporter.once('reportPostLogging', function onEvent() {
        assert.ok(true);

        assert.ok(fs.existsSync('/foo/bar'));

        var buf = fs.readFileSync('/foo/bar');
        var lines = String(buf).trim().split('\n');

        assert.equal(lines.length, 3);

        var line1 = JSON.parse(lines[0]);
        var line2 = JSON.parse(lines[1]);
        var line3 = JSON.parse(lines[2]);

        assert.equal(line1.message, 'async exception error');
        assert.equal(line1._uncaughtType,
            'exception.occurred');

        assert.equal(line2.message, 'async exception error');
        assert.equal(line2._uncaughtType,
            'logger.uncaught.exception');

        assert.equal(line3.type,
            'uncaught-exception.logger.async-error');
        assert.equal(line3._uncaughtType,
            'logger.failure');

        remove();
        assert.end();
    });

    process.nextTick(function throwIt() {
        throw new Error('async exception error');
    });
});

test('handles async exceptions for logger', function t(assert) {
    var logger = {
        fatal: function fatal() {
            // simulate a bug
            process.nextTick(function throwIt() {
                throw new Error('bug in logger implementation');
            });
        }
    };

    var fs = FakeFs();
    fs.dir('/foo');
    var reporter = new EventReporter();

    var remove = uncaught({
        logger: logger,
        fs: fs,
        reporter: reporter,
        gracefulShutdown: function graceful() {
            assert.ok(true);

            assert.ok(fs.existsSync('/foo/bar'));

            var buf = fs.readFileSync('/foo/bar');
            var lines = String(buf).trim().split('\n');

            assert.equal(lines.length, 3);

            var line1 = JSON.parse(lines[0]);
            var line2 = JSON.parse(lines[1]);
            var line3 = JSON.parse(lines[2]);

            assert.equal(line1.message, 'async exception error');
            assert.equal(line1._uncaughtType,
                'exception.occurred');

            assert.equal(line2.message, 'async exception error');
            assert.equal(line2._uncaughtType,
                'logger.uncaught.exception');

            assert.equal(line3.type,
                'uncaught-exception.logger.async-error');
            assert.equal(line3._uncaughtType,
                'logger.failure');

            remove();
            assert.end();
        },
        abortOnUncaught: true,
        backupFile: '/foo/bar'
    });

    process.nextTick(function throwIt() {
        throw new Error('async exception error');
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
    var reporter = EventReporter();

    var remove = uncaught({
        logger: logger,
        reporter: reporter,
        setTimeout: timer.setTimeout,
        clearTimeout: timer.clearTimeout,
        loggerTimeout: timeout
    });

    reporter.once('reportPostLogging', function onEvent() {
        assert.ok(true);

        remove();
        assert.end();
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
            logger: {}
        });
    });

    assert.ok(tuple3[0]);
    assert.equal(tuple3[0].type,
        'uncaught-exception.statsd.required');

    var tuple4 = tryCatch(function throwIt() {
        uncaughtException({
            statsd: {},
            logger: {
                error: function e() {}
            }
        });
    });

    assert.ok(tuple4[0]);
    assert.equal(tuple4[0].type,
        'uncaught-exception.logger.methodsRequired');

    var tuple5 = tryCatch(function throwIt() {
        uncaughtException({
            statsd: {
                increment: function it() {}
            },
            logger: {
                fatal: function e() {}
            }
        });
    });

    assert.ok(tuple5[0]);
    assert.equal(tuple5[0].type,
        'uncaught-exception.statsd.methodsRequired');

    var tuple6 = tryCatch(function throwIt() {
        uncaughtException({
            statsd: {},
            logger: {},
            backupFile: true
        });
    });

    assert.ok(tuple6[0]);
    assert.equal(tuple6[0].type,
        'uncaught-exception.invalid.backupFile');

    var tuple7 = tryCatch(function throwIt() {
        return uncaughtException({
            statsd: {
                immediateIncrement: function it() {}
            },
            logger: {
                fatal: function e() {}
            }
        });
    });

    assert.ok(!tuple7[0]);
    assert.equal(typeof tuple7[1], 'function');

    assert.end();
});

test('uncaught emits stats', function t(assert) {
    var remove;
    var logger = {
        fatal: function fatal(msg, err, cb) {
            cb();
        }
    };
    var statsd = {
        immediateIncrement: function inc(key, n) {
            assert.equal(key, 'service-crash');
            assert.equal(n, 1);

            remove();
            assert.end();
        }
    };
    remove = uncaught({
        logger: logger,
        statsd: statsd
    });

    process.nextTick(function throwIt() {
        throw new Error('error test');
    });
});

test('uncaught emits with custom statsKey', function t(assert) {
    var remove;
    var logger = {
        fatal: function fatal(msg, err, cb) {
            cb();
        }
    };
    var statsd = {
        immediateIncrement: function inc(key, n) {
            assert.equal(key, 'my-service-crash');
            assert.equal(n, 1);

            remove();
            assert.end();
        }
    };
    remove = uncaught({
        logger: logger,
        statsd: statsd,
        statsdKey: 'my-service-crash'
    });

    process.nextTick(function throwIt() {
        throw new Error('error test');
    });
});

test('uncaught waits a custom amount of time');
test.only('uncaught times out bad statsd', function t(assert) {
    var remove;
    var timers = Timer(0);
    var fs = FakeFs();
    fs.dir('/foo');
    var logger = {
        fatal: function fatal(msg, err, cb) {
            cb();
        }
    };
    var statsd = {
        immediateIncrement: function inc(key, n) {
            timers.advance(30 * 1000);
        }
    };
    var reporter = EventReporter();

    remove = uncaught({
        logger: logger,
        statsd: statsd,
        fs: fs,
        backupFile: '/foo/bar',
        setTimeout: timers.setTimeout,
        clearTimeout: timers.clearTimeout,
        reporter: reporter,
        statsdKey: 'my-service-crash'
    });

    reporter.once('reportPostStatsd', function onEvent() {
        assert.ok(true);

        assert.ok(fs.existsSync('/foo/bar'));

        var buf = fs.readFileSync('/foo/bar');
        var lines = String(buf).trim().split('\n');

        assert.equal(lines.length, 3);

        var line1 = JSON.parse(lines[0]);
        var line2 = JSON.parse(lines[1]);
        var line3 = JSON.parse(lines[2]);

        assert.equal(line1.message, 'statsd timeout error');
        assert.equal(line1._uncaughtType,
            'exception.occurred');

        assert.equal(line2.message, 'statsd timeout error');
        assert.equal(line2._uncaughtType,
            'statsd.uncaught.exception');

        assert.equal(line3.type,
            'uncaught-exception.statsd.timeout');
        assert.equal(line3._uncaughtType,
            'statsd.failure');

        remove();
        assert.end();
    });

    process.nextTick(function throwIt() {
        throw new Error('statsd timeout error');
    });
});
