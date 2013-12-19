var test = require('assert-tap').test;
var EventEmitter = require('events').EventEmitter;

var domainHandler = require('../domain.js');

test('will throw errors', function (assert) {
    var handler = domainHandler();

    assert.throws(function () {
        handler([], function (err, d) {
            d.dispose();
        }, function () {
            throw new Error('test error');
        });
    }, /test error/);

    assert.end();
});

test('can handle errors', function (assert) {
    var handler = domainHandler();

    // handler will throw and go to uncaughtException
    handler([], function (error, domain) {
        assert.equal(error.message, 'test error');
        domain.dispose();

        assert.end();
    }, function () {
        throw new Error('test error');
    });
});

test('will handle thrown errors', function (assert) {
    var handler = domainHandler({ tryCatch: true });

    assert.doesNotThrow(function () {
        // handler does not throw.
        handler([], function (error, domain) {
            assert.equal(error.message, 'test error');
            domain.dispose();

            assert.end();
        }, function () {
            throw new Error('test error');
        });
    });
});

test('should call errorHandler', function (assert) {
    var handler = domainHandler();

    // handler does not thrown. async thrown exception goes to
    // uncaughtException
    handler([], function handleError(error, domain) {
        assert.ok(error);

        assert.equal(error && error.message, 'test err');

        domain.dispose();
        assert.end();
    }, function () {
        process.nextTick(function () {
            throw new Error('test err');
        });
    });
});

test('calls error handler from emitters too', function (assert) {
    var handler = domainHandler();
    var emitter = new EventEmitter();

    handler([emitter], function handleError(error, domain) {
        assert.ok(error);

        assert.equal(error && error.message, 'test err');

        domain.dispose();
        assert.end();
    }, function () {
        process.nextTick(function () {
            emitter.emit('error', new Error('test err'));
        });
    });
});
