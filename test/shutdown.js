var test = require('assert-tap').test;
var path = require('path');
var process = require('process');
var exec = require('child_process').exec;
var fs = require('fs');

/* SHUTDOWN tests.

    To test whether or not uncaught exception handler will shutdown
        a process we spawn numerous sub proceses and test that
        they are succesfully crashed like a node process would
        crash.
*/

var shutdownChild = path.join(__dirname, 'shutdown-child.js');
var count = 0;
// child process will only exit 128 + 6 if it dumps core
// to enable core dumps run `ulimit -c unlimited`
var SIGABRT_CODE = 134;

function spawnChild(opts, callback) {
    /*jshint camelcase: false */
    var isIstanbul = process.env.running_under_istanbul;

    var cmd;
    // istanbul can't actually cover processes that crash.
    // so there is little point as it doesn't add much coverage
    // in the future it will https://github.com/gotwarlost/istanbul/issues/127
    if (isIstanbul) {
        cmd = 'node_modules/.bin/istanbul cover ' + shutdownChild +
            ' --report cobertura' +
            ' --dir coverage/shutdown-child' + count + ' -- \'' +
            JSON.stringify(opts) + '\'';
    } else {
        cmd = 'node ' + shutdownChild + ' \'' + JSON.stringify(opts) + '\'';
    }

    count++;
    exec(cmd, {
        timeout: 5000,
        cwd: path.join(__dirname, '..')
    }, callback);
}

test('a child process is aborted', function t(assert) {
    spawnChild({
        consoleLogger: true,
        message: 'crash cleanly'
    }, function onerror(err, stdout, stderr) {
        assert.ok(err);
        assert.equal(err.code, SIGABRT_CODE);

        assert.notEqual(
            stderr.indexOf('Uncaught Exception: '), -1);
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
        assert.equal(err.code, SIGABRT_CODE);

        assert.notEqual(
            stderr.indexOf('Uncaught Exception: '), -1);
        assert.notEqual(
            stderr.indexOf('really crash'), -1);

        assert.end();
    });
});

test('writes to backupFile for failing logger', function t(assert) {
    var loc = path.join(__dirname, 'backupFile.log');

    spawnChild({
        errorLogger: true,
        message: 'crash with file',
        backupFile: loc
    }, function onerror(err, stdout, stderr) {
        assert.ok(err);
        assert.equal(err.code, SIGABRT_CODE);

        assert.equal(stdout.indexOf('crash with file'), -1);
        assert.equal(stderr.indexOf('crash with file'), -1);

        fs.readFile(loc, function onfile(err, buf) {
            assert.ifError(err);

            var lines = String(buf).trim().split('\n');

            assert.equal(lines.length, 2);
            var line1 = JSON.parse(lines[0]);
            var line2 = JSON.parse(lines[1]);

            assert.equal(line1.message, 'crash with file');
            assert.equal(line1._uncaughtType,
                'uncaught.exception');

            assert.equal(line2.message,
                'oops in logger.fatal()');
            assert.equal(line2._uncaughtType, 'logger.failure');

            fs.unlink(loc, assert.end);
        });
    });
});

test('writes to backupFile for failing shutdown', function t(assert) {
    var loc = path.join(__dirname, 'backupFile.log');

    spawnChild({
        message: 'crash with bad shutdown',
        backupFile: loc,
        badShutdown: true
    }, function onerror(err, stdout, stderr) {
        assert.ok(err);
        assert.equal(err.code, SIGABRT_CODE);

        assert.equal(
            stdout.indexOf('crash with bad shutdown'), -1);
        assert.equal(
            stderr.indexOf('crash with bad shutdown'), -1);

        fs.readFile(loc, function onfile(err, buf) {
            assert.ifError(err);

            var lines = String(buf).trim().split('\n');

            assert.equal(lines.length, 2);
            var line1 = JSON.parse(lines[0]);
            var line2 = JSON.parse(lines[1]);

            assert.equal(line1.message,
                'crash with bad shutdown');
            assert.equal(line1._uncaughtType,
                'uncaught.exception');

            assert.equal(line2.message,
                'oops in graceful shutdown');
            assert.equal(line2._uncaughtType, 'shutdown.failure');

            fs.unlink(loc, assert.end);
        });
    });
});

test('handles a timeout logger', function t(assert) {
    var loc = path.join(__dirname, 'backupFile.log');

    spawnChild({
        timeoutLogger: true,
        message: 'timeout logger',
        backupFile: loc,
        loggerTimeout: 500
    }, function onerror(err, stdout, stderr) {
        assert.ok(err);
        assert.equal(err.code, SIGABRT_CODE);

        assert.equal(stdout.indexOf('timeout logger'), -1);
        assert.equal(stderr.indexOf('timeout logger'), -1);

        fs.readFile(loc, function onfile(err, buf) {
            assert.ifError(err);

            var lines = String(buf).trim().split('\n');

            assert.equal(lines.length, 2);
            var line1 = JSON.parse(lines[0]);
            var line2 = JSON.parse(lines[1]);

            assert.equal(line1.message, 'timeout logger');
            assert.equal(line1._uncaughtType,
                'uncaught.exception');

            assert.equal(line2.type,
                'uncaught-exception.logger.timeout');
            assert.equal(line2._uncaughtType, 'logger.failure');

            fs.unlink(loc, assert.end);
        });
    });
});

test('handles a timeout shutdown', function t(assert) {
    var loc = path.join(__dirname, 'backupFile.log');

    spawnChild({
        timeoutShutdown: true,
        message: 'timeout shutdown',
        backupFile: loc,
        shutdownTimeout: 500
    }, function onerror(err, stdout, stderr) {
        assert.ok(err);
        assert.equal(err.code, SIGABRT_CODE);

        assert.equal(stdout.indexOf('timeout shutdown'), -1);
        assert.equal(stderr.indexOf('timeout shutdown'), -1);

        fs.readFile(loc, function onfile(err, buf) {
            assert.ifError(err);

            var lines = String(buf).trim().split('\n');

            assert.equal(lines.length, 2);
            var line1 = JSON.parse(lines[0]);
            var line2 = JSON.parse(lines[1]);

            assert.equal(line1.message, 'timeout shutdown');
            assert.equal(line1._uncaughtType,
                'uncaught.exception');

            assert.equal(line2.type,
                'uncaught-exception.shutdown.timeout');
            assert.equal(line2._uncaughtType,
                'shutdown.failure');

            fs.unlink(loc, assert.end);
        });
    });
});

test('handles a timeout + late succeed', function t(assert) {
    var loc = path.join(__dirname, 'backupFile.log');

    spawnChild({
        lateTimeoutLogger: true,
        message: 'late timeout logger',
        backupFile: loc
    }, function onerror(err, stdout, stderr) {
        assert.ok(err);
        assert.equal(err.code, SIGABRT_CODE);

        assert.equal(stdout.indexOf('late timeout logger'), -1);
        assert.equal(stderr.indexOf('late timeout logger'), -1);

        fs.readFile(loc, function onfile(err, buf) {
            assert.ifError(err);

            var lines = String(buf).trim().split('\n');

            assert.equal(lines.length, 2);
            var line1 = JSON.parse(lines[0]);
            var line2 = JSON.parse(lines[1]);

            assert.equal(line1.message, 'late timeout logger');
            assert.equal(line1._uncaughtType,
                'uncaught.exception');

            assert.equal(line2.type,
                'uncaught-exception.logger.timeout');
            assert.equal(line2._uncaughtType, 'logger.failure');

            fs.unlink(loc, assert.end);
        });
    });
});

test('handles a shutdown + late succeed', function t(assert) {
    var loc = path.join(__dirname, 'backupFile.log');

    spawnChild({
        lateTimeoutShutdown: true,
        message: 'late shutdown logger',
        backupFile: loc
    }, function onerror(err, stdout, stderr) {
        assert.ok(err);
        assert.equal(err.code, SIGABRT_CODE);

        assert.equal(stdout.indexOf('late shutdown logger'), -1);
        assert.equal(stderr.indexOf('late shutdown logger'), -1);

        fs.readFile(loc, function onfile(err, buf) {
            assert.ifError(err);

            var lines = String(buf).trim().split('\n');

            assert.equal(lines.length, 2);
            var line1 = JSON.parse(lines[0]);
            var line2 = JSON.parse(lines[1]);

            assert.equal(line1.message, 'late shutdown logger');
            assert.equal(line1._uncaughtType,
                'uncaught.exception');

            assert.equal(line2.type,
                'uncaught-exception.shutdown.timeout');
            assert.equal(line2._uncaughtType,
                'shutdown.failure');

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
        assert.equal(err.code, SIGABRT_CODE);

        assert.notEqual(
            stderr.indexOf('Uncaught Exception: '), -1);
        assert.notEqual(
            stderr.indexOf('crash with bad backupFile'), -1);

        assert.end();
    });
});
