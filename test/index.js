'use strict';

var test = require('tape');
var process = require('process');
var path = require('path');
var exec = require('child_process').exec;

require('./uncaught.js');
require('./shutdown.js');

test('check coverage', function t(assert) {
    getCoverage(function onCoverage(err, out) {
        assert.ifError(err);

        if (out) {
            console.warn('Code coverage is not 100%');
            console.log(out.report);
            console.log('SUGGESTED FIX: get 100% code coverage');
            process.exit(1);
        } else {
            assert.ok(true);
            assert.end();
        }
    });
});

function getCoverage(cb) {
    var cmd = path.join(__dirname, '..', 'node_modules',
        '.bin', 'istanbul');
    exec(cmd + ' check-coverage --branches=100 --lines=100', {
        cwd: path.join(__dirname, '..')
    }, onCmd);

    function onCmd(err, stdout, stderr) {
        if (!err) {
            return cb(null);
        }

        var reportCmd = cmd + ' report text';
        exec(reportCmd, {
            cwd: path.join(__dirname, '..')
        }, onReport);

        function onReport(err2, stdout2, stderr2) {
            cb(err2, {
                checkCoverage: stdout + stderr,
                report: stdout2 + stderr2
            });
        }
    }
}
