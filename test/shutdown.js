'use strict';

var test = require('tape');
var path = require('path');
var fs = require('fs');

/* SHUTDOWN tests.

    To test whether or not uncaught exception handler will shutdown
        a process we spawn numerous sub proceses and test that
        they are succesfully crashed like a node process would
        crash.
*/

var TestChild = require('./lib/test-child.js');
var spawnChild = require('./lib/spawn-child.js');

// child process will only exit 128 + 6 if it dumps core
// to enable core dumps run `ulimit -c unlimited`
var BACKUP_FILE = path.join(__dirname, 'backupFile.log');
var SIGABRT_SIGNAL = 'SIGABRT';
var SIGABRT_CODE = 134;
var SHUTDOWN_TIMEOUT = 50;

function isAbortError(err) {
    return err.signal === SIGABRT_SIGNAL ||
        err.code === SIGABRT_CODE;
}

test('a child process is aborted', function t(assert) {
    spawnChild({
        consoleLogger: true,
        message: 'crash cleanly'
    }, function onerror(err, stdout, stderr) {
        assert.ok(err);
        assert.ok(isAbortError(err));

        assert.notEqual(
            stderr.indexOf('Uncaught Exception'), -1);
        assert.notEqual(
            stderr.indexOf('crash cleanly'), -1);

        assert.end();
    });
});

test('throwing in preAbort', function t(assert) {
    spawnChild({
        consoleLogger: true,
        message: 'really crash',
        throwInAbort: true
    }, function onerror(err, stdout, stderr) {
        assert.ok(err);
        assert.ok(isAbortError(err));

        assert.notEqual(
            stderr.indexOf('Uncaught Exception'), -1);
        assert.notEqual(
            stderr.indexOf('really crash'), -1);

        assert.end();
    });
});

test('writes to backupFile for failing logger', function t(assert) {
    var loc = BACKUP_FILE;

    spawnChild({
        errorLogger: true,
        message: 'crash with file',
        backupFile: loc
    }, function onerror(err, stdout, stderr) {
        assert.ok(err);
        assert.ok(isAbortError(err));

        assert.equal(stdout.indexOf('crash with file'), -1);
        assert.equal(stderr.indexOf('crash with file'), -1);

        fs.readFile(loc, function onfile(err2, buf) {
            assert.ifError(err2);

            var lines = String(buf).trim().split('\n');

            assert.equal(lines.length, 3);
            var line1 = JSON.parse(lines[0]);
            var line2 = JSON.parse(lines[1]);
            var line3 = JSON.parse(lines[2]);

            assert.equal(line1.message, 'crash with file');
            assert.equal(line1._uncaughtType,
                'exception.occurred');

            assert.equal(line2.message, 'crash with file');
            assert.equal(line2._uncaughtType,
                'logger.uncaught.exception');

            assert.equal(line3.message,
                'oops in logger.fatal()');
            assert.equal(line3._uncaughtType, 'logger.failure');

            fs.unlink(loc, assert.end);
        });
    });
});

test('writes to stdout with backupFile stdout', function t(assert) {
    spawnChild({
        errorLogger: true,
        message: 'crash with file',
        backupFile: 'stdout'
    }, function onerror(err, stdout, stderr) {
        assert.ok(err);
        assert.ok(isAbortError(err));

        assert.equal(stderr.indexOf('crash with file'), -1);

        var buf = stdout;

        var lines = String(buf).trim().split('\n');

        assert.equal(lines.length, 3);
        var line1 = JSON.parse(lines[0]);
        var line2 = JSON.parse(lines[1]);
        var line3 = JSON.parse(lines[2]);

        assert.equal(line1.message, 'crash with file');
        assert.equal(line1._uncaughtType,
            'exception.occurred');

        assert.equal(line2.message, 'crash with file');
        assert.equal(line2._uncaughtType,
            'logger.uncaught.exception');

        assert.equal(line3.message,
            'oops in logger.fatal()');
        assert.equal(line3._uncaughtType, 'logger.failure');

        assert.end();
    });
});

test('writes to stderr with backupFile stderr', function t(assert) {
    spawnChild({
        errorLogger: true,
        message: 'crash with file',
        backupFile: 'stderr'
    }, function onerror(err, stdout, stderr) {
        assert.ok(err);
        assert.ok(isAbortError(err));

        assert.equal(stdout.indexOf('crash with file'), -1);

        var buf = stderr;

        var lines = String(buf).trim().split('\n');

        // line 4 may exist if ulimit is set and the
        // the process core dumps
        assert.ok(lines.length >= 3);
        var line1 = JSON.parse(lines[0]);
        var line2 = JSON.parse(lines[1]);
        var line3 = JSON.parse(lines[2]);

        assert.equal(line1.message, 'crash with file');
        assert.equal(line1._uncaughtType,
            'exception.occurred');

        assert.equal(line2.message, 'crash with file');
        assert.equal(line2._uncaughtType,
            'logger.uncaught.exception');

        assert.equal(line3.message,
            'oops in logger.fatal()');
        assert.equal(line3._uncaughtType, 'logger.failure');

        assert.end();
    });
});

test('async failing logger', function t(assert) {
    var loc = BACKUP_FILE;

    spawnChild({
        asyncErrorLogger: true,
        message: 'async error logger',
        backupFile: loc
    }, function onerror(err, stdout, stderr) {
        assert.ok(err);
        assert.ok(isAbortError(err));

        assert.equal(stdout.indexOf('async error logger'), -1);
        assert.equal(stderr.indexOf('async error logger'), -1);

        fs.readFile(loc, function onfile(err2, buf) {
            assert.ifError(err2);

            var lines = String(buf).trim().split('\n');

            assert.equal(lines.length, 3);
            var line1 = JSON.parse(lines[0]);
            var line2 = JSON.parse(lines[1]);
            var line3 = JSON.parse(lines[2]);

            assert.equal(line1.message, 'async error logger');
            assert.equal(line1._uncaughtType,
                'exception.occurred');

            assert.equal(line2.message, 'async error logger');
            assert.equal(line2._uncaughtType,
                'logger.uncaught.exception');

            assert.equal(line3.type,
                'uncaught-exception.logger.async-error');
            assert.equal(line3._uncaughtType, 'logger.failure');

            fs.unlink(loc, assert.end);
        });
    });
});

test('writes to backupFile for failing shutdown', function t(assert) {
    var loc = BACKUP_FILE;

    spawnChild({
        message: 'crash with bad shutdown',
        backupFile: loc,
        badShutdown: true
    }, function onerror(err, stdout, stderr) {
        assert.ok(err);
        assert.ok(isAbortError(err));

        assert.equal(
            stdout.indexOf('crash with bad shutdown'), -1);
        assert.equal(
            stderr.indexOf('crash with bad shutdown'), -1);

        fs.readFile(loc, function onfile(err2, buf) {
            assert.ifError(err2);

            var lines = String(buf).trim().split('\n');

            assert.equal(lines.length, 3);
            var line1 = JSON.parse(lines[0]);
            var line2 = JSON.parse(lines[1]);
            var line3 = JSON.parse(lines[2]);

            assert.equal(line1.message,
                'crash with bad shutdown');
            assert.equal(line1._uncaughtType,
                'exception.occurred');

            assert.equal(line2.message,
                'crash with bad shutdown');
            assert.equal(line2._uncaughtType,
                'shutdown.uncaught.exception');

            assert.equal(line3.message,
                'oops in graceful shutdown');
            assert.equal(line3._uncaughtType,
                'shutdown.failure');

            fs.unlink(loc, assert.end);
        });
    });
});

test('handles a naughty shutdown', function t(assert) {
    var loc = BACKUP_FILE;

    spawnChild({
        message: 'crash with naughty shutdown',
        backupFile: loc,
        naughtyShutdown: true
    }, function onerror(err, stdout, stderr) {
        assert.ok(err);
        assert.ok(isAbortError(err));

        assert.equal(
            stdout.indexOf('crash with naughty shutdown'), -1);
        assert.equal(
            stderr.indexOf('crash with naughty shutdown'), -1);

        fs.readFile(loc, function onfile(err2, buf) {
            assert.ifError(err2);

            var lines = String(buf).trim().split('\n');

            assert.equal(lines.length, 2);
            var line1 = JSON.parse(lines[0]);
            var line2 = JSON.parse(lines[1]);

            assert.equal(line1.message,
                'crash with naughty shutdown');
            assert.equal(line1._uncaughtType,
                'exception.occurred');

            assert.equal(line2.message,
                'crash with naughty shutdown');
            assert.equal(line2._uncaughtType,
                'shutdown.uncaught.exception');

            fs.unlink(loc, assert.end);
        });
    });
});

test('async failing shutdown', function t(assert) {
    var loc = BACKUP_FILE;

    spawnChild({
        message: 'async failing shutdown',
        backupFile: loc,
        asyncBadShutdown: true
    }, function onerror(err, stdout, stderr) {
        assert.ok(err);
        assert.ok(isAbortError(err));

        assert.equal(
            stdout.indexOf('async failing shutdown'), -1);
        assert.equal(
            stderr.indexOf('async failing shutdown'), -1);

        fs.readFile(loc, function onfile(err2, buf) {
            assert.ifError(err2);

            var lines = String(buf).trim().split('\n');

            assert.equal(lines.length, 3);
            var line1 = JSON.parse(lines[0]);
            var line2 = JSON.parse(lines[1]);
            var line3 = JSON.parse(lines[2]);

            assert.equal(line1.message,
                'async failing shutdown');
            assert.equal(line1._uncaughtType,
                'exception.occurred');

            assert.equal(line2.message,
                'async failing shutdown');
            assert.equal(line2._uncaughtType,
                'shutdown.uncaught.exception');

            assert.equal(line3.type,
                'uncaught-exception.shutdown.async-error');
            assert.equal(line3._uncaughtType,
                'shutdown.failure');

            fs.unlink(loc, assert.end);
        });
    });
});

test('handles a timeout logger', function t(assert) {
    var loc = BACKUP_FILE;

    spawnChild({
        timeoutLogger: true,
        message: 'timeout logger',
        backupFile: loc,
        loggerTimeout: SHUTDOWN_TIMEOUT
    }, function onerror(err, stdout, stderr) {
        assert.ok(err);
        assert.ok(isAbortError(err));

        assert.equal(stdout.indexOf('timeout logger'), -1);
        assert.equal(stderr.indexOf('timeout logger'), -1);

        fs.readFile(loc, function onfile(err2, buf) {
            assert.ifError(err2);

            var lines = String(buf).trim().split('\n');

            assert.equal(lines.length, 3);
            var line1 = JSON.parse(lines[0]);
            var line2 = JSON.parse(lines[1]);
            var line3 = JSON.parse(lines[2]);

            assert.equal(line1.message, 'timeout logger');
            assert.equal(line1._uncaughtType,
                'exception.occurred');

            assert.equal(line2.message, 'timeout logger');
            assert.equal(line2._uncaughtType,
                'logger.uncaught.exception');

            assert.equal(line3.type,
                'uncaught-exception.logger.timeout');
            assert.equal(line3._uncaughtType, 'logger.failure');

            fs.unlink(loc, assert.end);
        });
    });
});

test('handles a thrown logger', function t(assert) {
    var loc = BACKUP_FILE;

    spawnChild({
        thrownLogger: true,
        message: 'thrown logger',
        backupFile: loc
    }, function onerror(err, stdout, stderr) {
        assert.ok(err);
        assert.ok(isAbortError(err));

        assert.equal(stdout.indexOf('thrown logger'), -1);
        assert.equal(stderr.indexOf('thrown logger'), -1);

        fs.readFile(loc, function onfile(err2, buf) {
            assert.ifError(err2);

            var lines = String(buf).trim().split('\n');

            assert.equal(lines.length, 3);
            var line1 = JSON.parse(lines[0]);
            var line2 = JSON.parse(lines[1]);
            var line3 = JSON.parse(lines[2]);

            assert.equal(line1.message, 'thrown logger');
            assert.equal(line1._uncaughtType,
                'exception.occurred');

            assert.equal(line2.message, 'thrown logger');
            assert.equal(line2._uncaughtType,
                'logger.uncaught.exception');

            assert.equal(line3.type,
                'uncaught-exception.logger.threw');
            assert.equal(line3._uncaughtType, 'logger.failure');

            fs.unlink(loc, assert.end);
        });
    });
});

test('handles a timeout shutdown', function t(assert) {
    var loc = BACKUP_FILE;

    spawnChild({
        timeoutShutdown: true,
        message: 'timeout shutdown',
        backupFile: loc,
        shutdownTimeout: SHUTDOWN_TIMEOUT
    }, function onerror(err, stdout, stderr) {
        assert.ok(err);
        assert.ok(isAbortError(err));

        assert.equal(stdout.indexOf('timeout shutdown'), -1);
        assert.equal(stderr.indexOf('timeout shutdown'), -1);

        fs.readFile(loc, function onfile(err2, buf) {
            assert.ifError(err2);

            var lines = String(buf).trim().split('\n');

            assert.equal(lines.length, 3);
            var line1 = JSON.parse(lines[0]);
            var line2 = JSON.parse(lines[1]);
            var line3 = JSON.parse(lines[2]);

            assert.equal(line1.message, 'timeout shutdown');
            assert.equal(line1._uncaughtType,
                'exception.occurred');

            assert.equal(line2.message, 'timeout shutdown');
            assert.equal(line2._uncaughtType,
                'shutdown.uncaught.exception');

            assert.equal(line3.type,
                'uncaught-exception.shutdown.timeout');
            assert.equal(line3._uncaughtType,
                'shutdown.failure');

            fs.unlink(loc, assert.end);
        });
    });
});

test('handles a thrown shutdown', function t(assert) {
    var loc = BACKUP_FILE;

    spawnChild({
        thrownShutdown: true,
        message: 'thrown shutdown',
        backupFile: loc
    }, function onerror(err, stdout, stderr) {
        assert.ok(err);
        assert.ok(isAbortError(err));

        assert.equal(stdout.indexOf('thrown shutdown'), -1);
        assert.equal(stderr.indexOf('thrown shutdown'), -1);

        fs.readFile(loc, function onfile(err2, buf) {
            assert.ifError(err2);

            var lines = String(buf).trim().split('\n');

            assert.equal(lines.length, 3);
            var line1 = JSON.parse(lines[0]);
            var line2 = JSON.parse(lines[1]);
            var line3 = JSON.parse(lines[2]);

            assert.equal(line1.message, 'thrown shutdown');
            assert.equal(line1._uncaughtType,
                'exception.occurred');

            assert.equal(line2.message, 'thrown shutdown');
            assert.equal(line2._uncaughtType,
                'shutdown.uncaught.exception');

            assert.equal(line3.type,
                'uncaught-exception.shutdown.threw');
            assert.equal(line3._uncaughtType,
                'shutdown.failure');

            fs.unlink(loc, assert.end);
        });
    });
});

test('handles a timeout + late succeed', function t(assert) {
    var loc = BACKUP_FILE;

    spawnChild({
        lateTimeoutLogger: true,
        loggerTimeout: SHUTDOWN_TIMEOUT,
        message: 'late timeout logger',
        backupFile: loc
    }, function onerror(err, stdout, stderr) {
        assert.ok(err);
        assert.ok(isAbortError(err));

        assert.equal(stdout.indexOf('late timeout logger'), -1);
        assert.equal(stderr.indexOf('late timeout logger'), -1);

        fs.readFile(loc, function onfile(err2, buf) {
            assert.ifError(err2);

            var lines = String(buf).trim().split('\n');

            assert.equal(lines.length, 3);
            var line1 = JSON.parse(lines[0]);
            var line2 = JSON.parse(lines[1]);
            var line3 = JSON.parse(lines[2]);

            assert.equal(line1.message, 'late timeout logger');
            assert.equal(line1._uncaughtType,
                'exception.occurred');

            assert.equal(line2.message, 'late timeout logger');
            assert.equal(line2._uncaughtType,
                'logger.uncaught.exception');

            assert.equal(line3.type,
                'uncaught-exception.logger.timeout');
            assert.equal(line3._uncaughtType, 'logger.failure');

            fs.unlink(loc, assert.end);
        });
    });
});

test('handles a shutdown + late succeed', function t(assert) {
    var loc = BACKUP_FILE;

    spawnChild({
        lateTimeoutShutdown: true,
        message: 'late shutdown logger',
        shutdownTimeout: SHUTDOWN_TIMEOUT,
        backupFile: loc
    }, function onerror(err, stdout, stderr) {
        assert.ok(err);
        assert.ok(isAbortError(err));

        assert.equal(stdout.indexOf('late shutdown logger'), -1);
        assert.equal(stderr.indexOf('late shutdown logger'), -1);

        fs.readFile(loc, function onfile(err2, buf) {
            assert.ifError(err2);

            var lines = String(buf).trim().split('\n');

            assert.equal(lines.length, 3);
            var line1 = JSON.parse(lines[0]);
            var line2 = JSON.parse(lines[1]);
            var line3 = JSON.parse(lines[2]);

            assert.equal(line1.message, 'late shutdown logger');
            assert.equal(line1._uncaughtType,
                'exception.occurred');

            assert.equal(line2.message, 'late shutdown logger');
            assert.equal(line2._uncaughtType,
                'shutdown.uncaught.exception');

            assert.equal(line3.type,
                'uncaught-exception.shutdown.timeout');
            assert.equal(line3._uncaughtType,
                'shutdown.failure');

            fs.unlink(loc, assert.end);
        });
    });
});

test('continue on exception', function t(assert) {
    var loc = BACKUP_FILE;

    spawnChild({
        message: 'continue on exception',
        abortOnUncaught: false,
        consoleLogger: true,
        exitCode: 3,
        backupFile: loc
    }, function onerror(err, stdout, stderr) {
        assert.ok(err);
        assert.equal(err.code, 3);

        assert.equal(stdout.indexOf('continue on exception'), -1);
        assert.notEqual(
            stderr.indexOf('continue on exception'), -1);

        fs.readFile(loc, function onfile(err2, buf) {
            assert.ifError(err2);

            var lines = String(buf).trim().split('\n');

            assert.equal(lines.length, 1);
            var line1 = JSON.parse(lines[0]);

            assert.equal(line1.message, 'continue on exception');
            assert.equal(line1._uncaughtType, 'exception.occurred');

            fs.unlink(loc, assert.end);
        });
    });
});

test('continue on exception - do not call graceful', function t(assert) {
    var loc = BACKUP_FILE;

    spawnChild({
        message: 'continue on exception',
        abortOnUncaught: false,
        consoleLogger: true,
        exitOnGracefulShutdown: true,
        exitCode: 3,
        backupFile: loc
    }, function onerror(err, stdout, stderr) {
        assert.ok(err);
        assert.equal(err.code, 3);

        assert.equal(stdout.indexOf('continue on exception'), -1);
        assert.notEqual(
            stderr.indexOf('continue on exception'), -1);

        fs.readFile(loc, function onfile(err2, buf) {
            assert.ifError(err2);

            var lines = String(buf).trim().split('\n');

            assert.equal(lines.length, 1);
            var line1 = JSON.parse(lines[0]);

            assert.equal(line1.message, 'continue on exception');
            assert.equal(line1._uncaughtType, 'exception.occurred');

            fs.unlink(loc, assert.end);
        });
    });
});

test('continue on exception - do not call preAbort', function t(assert) {
    var loc = BACKUP_FILE;

    spawnChild({
        message: 'continue on exception',
        abortOnUncaught: false,
        consoleLogger: true,
        exitOnPreAbort: true,
        exitCode: 3,
        backupFile: loc
    }, function onerror(err, stdout, stderr) {
        assert.ok(err);
        assert.equal(err.code, 3);

        assert.equal(stdout.indexOf('continue on exception'), -1);
        assert.notEqual(
            stderr.indexOf('continue on exception'), -1);

        fs.readFile(loc, function onfile(err2, buf) {
            assert.ifError(err2);

            var lines = String(buf).trim().split('\n');

            assert.equal(lines.length, 1);
            var line1 = JSON.parse(lines[0]);

            assert.equal(line1.message, 'continue on exception');
            assert.equal(line1._uncaughtType, 'exception.occurred');

            fs.unlink(loc, assert.end);
        });
    });
});

test('handles writing to bad file', function t(assert) {
    var loc = path.join(__dirname, 'does', 'not', 'exist');

    spawnChild({
        message: 'crash with bad backupFile',
        backupFile: loc,
        consoleLogger: true,
        badShutdown: true
    }, function onerror(err, stdout, stderr) {
        assert.ok(err);
        assert.ok(isAbortError(err));

        assert.notEqual(
            stderr.indexOf('Uncaught Exception'), -1);
        assert.notEqual(
            stderr.indexOf('crash with bad backupFile'), -1);

        assert.end();
    });
});

TestChild.test('crashing with meta', {
    message: 'crash with meta',
    abortOnUncaught: true,
    meta: {
        testProp: 'testVal'
    },
    consoleLogger: true,
    backupFile: BACKUP_FILE
}, function t(child, assert) {
    assert.ok(child.err);
    assert.ok(isAbortError(child.err));

    assert.ok(
        child.stdout.indexOf('crash with meta') === -1
    );
    assert.ok(
        child.stderr.indexOf('crash with meta') >= 0
    );
    assert.ok(
        child.stderr.indexOf('testProp') >= 0
    );

    var lines = child.lines;

    assert.equal(lines.length, 1);
    var line1 = lines[0];

    assert.equal(line1.message, 'crash with meta');
    assert.equal(line1._uncaughtType, 'exception.occurred');

    assert.end();
});

TestChild.test('writes stats to UDP server', {
    message: 'crash with UDP stat',
    abortOnUncaught: true,
    udpServer: {},
    backupFile: BACKUP_FILE
}, function t(child, assert) {
    assert.ok(child.err);
    assert.ok(isAbortError(child.err));

    assert.equal(child.lines.length, 1);

    var stat = String(child.messages[0]);
    assert.equal(stat, 'service-crash:1|c');

    assert.end();
});

TestChild.test('setting a custom statsdKey', {
    message: 'crash with UDP stat',
    abortOnUncaught: true,
    statsdKey: 'my-service-crash',
    udpServer: {},
    backupFile: BACKUP_FILE
}, function t(child, assert) {
    assert.ok(child.err);
    assert.ok(isAbortError(child.err));

    assert.equal(child.lines.length, 1);

    var stat = String(child.messages[0]);
    assert.equal(stat, 'my-service-crash:1|c');

    assert.end();
});

TestChild.test('setting a custom wait period (high)', {
    message: 'crash with UDP stat',
    abortOnUncaught: true,
    statsdWaitPeriod: 600,
    statsdDelay: 500,
    udpServer: {},
    backupFile: BACKUP_FILE
}, function t(child, assert) {
    assert.ok(child.err);
    assert.ok(isAbortError(child.err));

    assert.equal(child.lines.length, 1);

    var stat = String(child.messages[0]);
    assert.equal(stat, 'service-crash:1|c');

    assert.end();
});

TestChild.test('setting a custom wait period (low)', {
    message: 'crash with UDP stat',
    abortOnUncaught: true,
    statsdWaitPeriod: 500,
    statsdDelay: 600,
    udpServer: {},
    backupFile: BACKUP_FILE
}, function t(child, assert) {
    assert.ok(child.err);
    assert.ok(isAbortError(child.err));

    assert.equal(child.lines.length, 1);
    assert.equal(child.messages.length, 0);

    assert.end();
});

TestChild.test('thrown statsd exception', {
    message: 'thrown exception statsd',
    abortOnUncaught: true,
    throwStatsdException: true,
    backupFile: BACKUP_FILE
}, function t(child, assert) {
    assert.ok(child.err);
    assert.ok(isAbortError(child.err));

    assert.equal(child.lines.length, 3);

    assert.equal(child.lines[0].message, 'thrown exception statsd');
    assert.equal(child.lines[0]._uncaughtType,
        'exception.occurred');

    assert.equal(child.lines[1].message, 'thrown exception statsd');
    assert.equal(child.lines[1]._uncaughtType,
        'statsd.uncaught.exception');

    assert.equal(child.lines[2].type,
        'uncaught-exception.statsd.threw');
    assert.equal(child.lines[2]._uncaughtType,
        'statsd.failure');

    assert.end();
});

TestChild.test('statsd implementation times out', {
    message: 'statsd times out',
    abortOnUncaught: true,
    timeoutStatsd: true,
    statsdTimeout: 500,
    backupFile: BACKUP_FILE
}, function t(child, assert) {
    assert.ok(child.err);
    assert.ok(isAbortError(child.err));

    assert.equal(child.lines.length, 3);

    assert.equal(child.lines[0].message, 'statsd times out');
    assert.equal(child.lines[0]._uncaughtType,
        'exception.occurred');

    assert.equal(child.lines[1].message, 'statsd times out');
    assert.equal(child.lines[1]._uncaughtType,
        'statsd.uncaught.exception');

    assert.equal(child.lines[2].type,
        'uncaught-exception.statsd.timeout');
    assert.equal(child.lines[2]._uncaughtType,
        'statsd.failure');

    assert.end();
});

TestChild.test('async statsd callback error', {
    message: 'statsd times out',
    abortOnUncaught: true,
    statsdShouldError: true,
    backupFile: BACKUP_FILE
}, function t(child, assert) {
    assert.ok(child.err);
    assert.ok(isAbortError(child.err));

    assert.equal(child.lines.length, 3);

    assert.equal(child.lines[0].message, 'statsd times out');
    assert.equal(child.lines[0]._uncaughtType,
        'exception.occurred');

    assert.equal(child.lines[1].message, 'statsd times out');
    assert.equal(child.lines[1]._uncaughtType,
        'statsd.uncaught.exception');

    assert.equal(child.lines[2].message,
        'statsd write fail');
    assert.equal(child.lines[2]._uncaughtType,
        'statsd.failure');

    assert.end();
});

TestChild.test('async thrown statsd exception', {
    message: 'statsd async exception',
    abortOnUncaught: true,
    statsdAsyncThrow: true,
    backupFile: BACKUP_FILE
}, function t(child, assert) {
    assert.ok(child.err);
    assert.ok(isAbortError(child.err));

    assert.equal(child.lines.length, 3);

    assert.equal(child.lines[0].message, 'statsd async exception');
    assert.equal(child.lines[0]._uncaughtType,
        'exception.occurred');

    assert.equal(child.lines[1].message, 'statsd async exception');
    assert.equal(child.lines[1]._uncaughtType,
        'statsd.uncaught.exception');

    assert.equal(child.lines[2].type,
        'uncaught-exception.statsd.async-error');
    assert.equal(child.lines[2]._uncaughtType,
        'statsd.failure');

    assert.end();
});
