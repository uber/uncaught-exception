'use strict';

var test = require('tape');
var dgram = require('dgram');
var fs = require('fs');

var spawnChild = require('./spawn-child.js');

TestChild.test = testTestChild;
TestChild.test.only = testTestChildOnly;

module.exports = TestChild;

function TestChild(opts) {
    if (!(this instanceof TestChild)) {
        return new TestChild(opts);
    }

    var self = this;

    self.opts = opts;
    self.child = null;
    self.err = null;
    self.stdout = null;
    self.stderr = null;

    self.lines = [];
    self.server = null;
    self.messages = [];
}

TestChild.prototype.bootstrap = function bootstrap(cb) {
    var self = this;

    if (typeof self.opts.udpServer === 'object') {
        self.server = dgram.createSocket('udp4');
        self.server.on('message', onMessage);
        self.server.bind(0, '127.0.0.1', onListening);
    } else {
        self.child = spawnChild(self.opts, onOutput);
    }

    function onMessage(buf) {
        self.messages.push(buf);
    }

    function onListening() {
        self.opts.udpServer.port = self.server.address().port;

        self.child = spawnChild(self.opts, onOutput);
    }

    function onOutput(err, stdout, stderr) {
        self.err = err;
        self.stdout = stdout;
        self.stderr = stderr;

        if (self.opts.backupFile) {
            fs.readFile(self.opts.backupFile, onFile);
        } else {
            cb(null);
        }
    }

    function onFile(err, content) {
        if (!err && content) {
            self.lines = String(content).trim().split('\n')
                .map(function parse(cont) {
                    return JSON.parse(cont);
                });
        }

        cb(null);
    }
};

TestChild.prototype.destroy = function destroy(cb) {
    var self = this;

    if (self.server) {
        self.server.close();
    }

    fs.unlink(self.opts.backupFile, cb);
};

function testTestChild(testName, opts, fn) {
    if (typeof opts === 'function') {
        fn = opts;
        opts = {};
    }

    test(testName, onAssert);

    function onAssert(assert) {
        assert.once('end', onEnd);

        var child = TestChild(opts);
        child.bootstrap(onReady);

        function onReady() {
            fn(child, assert);
        }

        function onEnd() {
            child.destroy();
        }
    }
}

function testTestChildOnly(testName, opts, fn) {
    if (typeof opts === 'function') {
        fn = opts;
        opts = {};
    }

    test.only(testName, onAssert);

    function onAssert(assert) {
        assert.once('end', onEnd);

        var child = TestChild(opts);
        child.bootstrap(onReady);

        function onReady() {
            fn(child, assert);
        }

        function onEnd() {
            child.destroy();
        }
    }
}
