// cannot use tape because it adds uncaughtException listeners
var test = require('assert-tap').test;
var process = require('process');
var FakeFs = require('fake-fs');

var uncaughtException = require('../uncaught.js');

function getListener() {
    return process.listeners('uncaughtException');
}

function uncaught(opts) {
    function remove() {
        process.removeListener('uncaughtException', onError);
    }

    var onError = uncaughtException(opts);
    process.on('uncaughtException', onError);

    return remove;
}

test('uncaughtException is a function', function t(assert) {
    assert.equal(typeof uncaughtException, 'function');
    assert.end();
});

test('uncaughtException with listener disabled does nothing',
    function t(assert) {
        var onError = uncaughtException({ logger: true });

        assert.equal(typeof onError, 'function');

        var ls = getListener();
        assert.equal(ls.length, 0);

        assert.end();
    });

test('uncaughtException adds a listener', function t(assert) {
    var remove = uncaught({ logger: true });

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
        prefix: 'some-server:'
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
            var body = JSON.parse(content);
            assert.equal(body.message, 'error test');
            assert.ok(body.stack);

            remove();
            assert.end();
        }
    };
    var fs = FakeFs();
    fs.dir('/foo');

    fs.appendFileSync = fs.writeFileSync;

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

    fs.appendFileSync = fs.writeFileSync;

    var remove = uncaught({
        logger: logger,
        fs: fs
    });

    process.nextTick(function throwIt() {
        throw new Error('test error');
    });
});
