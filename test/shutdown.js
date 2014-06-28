var test = require('assert-tap').test;
var path = require('path');
var exec = require('child_process').exec;

/* SHUTDOWN tests.

    To test whether or not uncaught exception handler will shutdown
        a process we spawn numerous sub proceses and test that
        they are succesfully crashed like a node process would
        crash.
*/

var shutdownChild = path.join(__dirname, 'shutdown-child.js');
var count = 0;

function spawnChild(opts, callback) {
    /*jshint camelcase: false */
    var isIstanbul = process.env.running_under_istanbul;

    var cmd;
    // istanbul can't actually cover processes that crash.
    // so there is little point as it doesn't add much coverage
    // in the future it will https://github.com/gotwarlost/istanbul/issues/127
    if (isIstanbul) {
        cmd = 'istanbul cover ' + shutdownChild + ' --report none' +
            ' --dir ./coverage/shutdown-child' + count + ' -- \'' +
            JSON.stringify(opts) + '\'';
    } else {
        cmd = 'node ' + shutdownChild + ' \'' + JSON.stringify(opts) + '\'';
    }

    count++;
    exec(cmd, {
        timeout: 5000,
        cwd: __dirname
    }, callback);
}

test('shutsdown cleanly without crashOnException', function t(assert) {
    spawnChild({
        consoleLogger: true,
        message: 'crash cleanly'
    }, function onerror(err, stdout, stderr) {
        assert.ok(err);
        assert.equal(err.code, 134);

        assert.notEqual(
            stderr.indexOf('Uncaught Exception: '), -1);
        assert.notEqual(
            stderr.indexOf('crash cleanly'), -1);

        assert.end();
    });
});

// test('shutsdown with crashOnException', function (assert) {
//     spawnChild({
//         message: 'crash on exception',
//         crashOnException: true
//     }, function (err, stdout, stderr) {
//         assert.ok(err);
//         assert.equal(err.code, 1);

//         assert.notEqual(err.message.indexOf('Error: crash on exception'), -1);

//         assert.equal(stdout, '');
//         assert.notEqual(stderr.indexOf('throw err;'), -1);

//         assert.end();
//     });
// });

// test('shutsdown with logger & crashOnException', function (assert) {
//     spawnChild({
//         message: 'logged crash on exception',
//         crashOnException: true,
//         consoleLogger: true
//     }, function (err, stdout, stderr) {
//         assert.ok(err);
//         assert.equal(err.code, 1);

//         assert.notEqual(
//             err.message.indexOf('Error: logged crash on exception'), -1);

//         var captureError = stderr.indexOf('uncaught err = logged crash');
//         var thrown = stderr.indexOf('throw err;');
//         assert.notEqual(captureError, -1);
//         assert.notEqual(thrown, -1);
//         assert.ok(captureError < thrown);

//         assert.end();
//     });
// });

// test('shutsdown with subject & logger & crashOnException', function (assert) {
//     spawnChild({
//         message: 'logged crash on excep.',
//         crashOnException: true,
//         subject: true,
//         consoleLogger: true
//     }, function (err, stdout, stderr) {
//         assert.ok(err);
//         assert.equal(err.code, 1);

//         assert.notEqual(
//             err.message.indexOf('Error: logged crash on excep.'), -1);

//         var captureError = stderr.indexOf('Error: logged crash on excep.');
//         var thrown = stderr.indexOf('throw err;');
//         assert.notEqual(captureError, -1);
//         assert.notEqual(thrown, -1);
//         assert.ok(captureError < thrown);

//         assert.end();
//     });
// });

// test('shutdown with subject & no logger & crashOnException', function (assert) {
//     spawnChild({
//         message: 'logged crash on excep.',
//         crashOnException: true,
//         subject: true
//     }, function (err, stdout, stderr) {
//         assert.ok(err);
//         assert.equal(err.code, 1);

//         assert.notEqual(
//             err.message.indexOf('Error: logged crash on excep.'), -1);

//         assert.equal(stdout, '');
//         assert.notEqual(stderr.indexOf('throw err;'), -1);

//         assert.end();
//     });
// });

