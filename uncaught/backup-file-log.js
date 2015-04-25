'use strict';

var process = require('process');
var os = require('os');
var jsonStringify = require('json-stringify-safe');

var tryCatch = require('../lib/try-catch-it.js');

module.exports = BackupFileLog;

function BackupFileLog(fs, backupFile) {
    var self = this;

    self.fs = fs;
    self.backupFile = backupFile;

    self.lines = {};
}

BackupFileLog.prototype.log =
function log(message, error) {
    var self = this;

    if (!self.backupFile) {
        return;
    }

    var str = self.stringifyError(error, message);
    self.lines[message] = str;
    self.safeAppend(self.fs, self.backupFile, str);
};

BackupFileLog.prototype.stringifyError =
function stringifyError(error, uncaughtType) {
    var d = new Date();

    return jsonStringify({
        message: error.message,
        type: error.type,
        _uncaughtType: uncaughtType,
        pid: process.pid,
        hostname: os.hostname(),
        ts: d.toISOString(),
        stack: error.stack
    }) + '\n';
};

BackupFileLog.prototype.safeAppend =
function safeAppend(fs, backupFile, str) {
    // try appending to the file. If this throws then just
    // ignore it and carry on. If we cannot write to this file
    // like it doesnt exist or read only file system then there
    // is no recovering
    tryCatch(function append() {
        if (backupFile === 'stdout') {
            process.stdout.write(str);
        } else if (backupFile === 'stderr') {
            process.stderr.write(str);
        } else {
            fs.appendFileSync(backupFile, str);
        }
    });
};
