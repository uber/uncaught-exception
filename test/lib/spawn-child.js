'use strict';

var path = require('path');
var process = require('process');
var exec = require('child_process').exec;

/* SHUTDOWN tests.

    To test whether or not uncaught exception handler will shutdown
        a process we spawn numerous sub proceses and test that
        they are succesfully crashed like a node process would
        crash.
*/

var shutdownChild = path.join(__dirname, '..', 'shutdown-child.js');
var count = 0;

module.exports = spawnChild;

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
            ' --print none' +
            ' --dir coverage/shutdown-child' + count + ' -- \'' +
            JSON.stringify(opts) + '\'';
    } else {
        cmd = 'node ' + shutdownChild + ' \'' + JSON.stringify(opts) + '\'';
    }

    count++;
    return exec(cmd, {
        timeout: 5000,
        cwd: path.join(__dirname, '..', '..')
    }, onSpawned);

    function onSpawned(err, stdout, stderr) {
        if (process.env.DEBUG) {
            console.log(stdout);
            console.error(stderr);
        }

        callback(err, stdout, stderr);
    }
}
