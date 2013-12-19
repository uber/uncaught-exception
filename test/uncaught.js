var test = require('assert-tap').test;

var uncaughtException = require('../uncaught.js');

function getListener() {
    var ls = process.listeners('uncaughtException');
    // remove uncaughtHandler. This is added by require('domain')
    return ls.filter(function (fn) {
        return fn.name !== 'uncaughtHandler';
    });
}

function uncaught(opts) {
    function remove() {
        process.removeListener('uncaughtException', onError);
    }

    var onError = uncaughtException(opts);
    process.on('uncaughtException', onError);

    remove.ravenClient = onError.ravenClient;

    return remove;
}

test('uncaughtException is a function', function (assert) {
    assert.equal(typeof uncaughtException, 'function');
    assert.end();
});

test('uncaughtException with listener disabled does nothing', function (assert) {
    var onError = uncaughtException();

    assert.equal(typeof onError, 'function');

    var ls = getListener();
    assert.equal(ls.length, 0);

    assert.end();
});

test('uncaughtException adds a listener', function (assert) {
    var remove = uncaught();

    var ls = getListener();
    assert.equal(ls.length, 1);

    remove();
    assert.end();
});

test('uncaughtException logs to logger on thrown exceptions', function (assert) {
    var remove = uncaught({
        crashOnException: false,
        logger: { error: function (msg, stack) {
            assert.equal(msg, 'uncaught err = test error');
            assert.ok(stack);

            remove();
            assert.end();
        } }
    });

    process.nextTick(function () {
        throw new Error('test error');
    });
});

test('setting subject sends different messages', function (assert) {
    var remove = uncaught({
        verbose: true,
        serviceName: 'foo',
        crashOnException: false,
        logger: {
            error: function (message, opts) {
                assert.notEqual(message.indexOf('subject error'), -1);
                assert.equal(opts.subject, 'foo -  Uncaught Exception');

                remove();
                assert.end();
            }
        }
    });

    process.nextTick(function () {
        throw new Error('subject error');
    });
});






