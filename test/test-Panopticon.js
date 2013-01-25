var Panopticon = require(__dirname + '/../index');
var cluster = require('cluster');

var now = Date.now();

function seDes(obj) {
	return JSON.parse(JSON.stringify(obj));
}

exports['test count static method'] = function (test) {
	test.expect(1);

	var panoptica = [];
	var count = 10;

	for (var i = 0; i < count; i++) {
		panoptica.push(new Panopticon(now, i, 1000, 1, null, null));
	}

	test.strictEqual(Panopticon.count(), count);

	panoptica.forEach(function (panopticon) {
		panopticon.stop();
	});

	test.done();
};

exports['check correct addition and subtraction of listeners on cluster'] = function (test) {
	test.expect(2);

	var panoptica = [];
	var count = 10;

	var initialListeners = cluster.listeners('fork').length;

	for (var i = 0; i < count; i++) {
		panoptica.push(new Panopticon(now, i, 1000, 1, null, null));
	}

	var beforeListeners = cluster.listeners('fork').length;

	test.strictEqual(beforeListeners, initialListeners + count);

	panoptica.forEach(function (panopticon) {
		panopticon.stop();
	});

	var afterListeners = cluster.listeners('fork').length;

	test.strictEqual(afterListeners, initialListeners);
	test.done();
};

exports['instantiation without interval is treated as 10000ms'] = function (test) {
	test.expect(1);

	var panopticon = new Panopticon(null, 'testSingle', null, null, null, null);

	test.strictEqual(panopticon.interval, 10000);

	panopticon.stop();

	test.done();
};

exports['test delivery'] = function (test) {
	test.expect(1);

	var panopticon = new Panopticon(Date.now(), 'testDelivery', 50, 1, null, null);
	var intervals = 0;

	var timeOut = setTimeout(function () {
		panopticon.stop();

		test.ok(false, 'delivery timed out');
		test.done();
	}, 1000);

	panopticon.on('sample', function (data) {
		intervals += 1;

		if (intervals === 1) {
			setTimeout(function () {
				panopticon.set([], 'should get removed', 'some info');
			}, 15);
		}

		if (intervals !== 3) {
			return;
		}

		test.ok(typeof data === 'object' && Object.keys(data).length === 0);


		panopticon.stop();
		clearTimeout(timeOut);
		timeOut = null;

		test.done();
	});
};

exports['test api'] = function (test) {
	var panopticon = new Panopticon(Date.now(), 'testSet', 50, 1, true, null);
	var counter = 0;

	var timeOut = setTimeout(function () {
		panopticon.stop();
		test.done();
	}, 120);

	var halfTime = setTimeout(function () {
		panopticon.set(null, 'testSet', 'someData');
		panopticon.inc(['incPath'], 'testInc', 1);
		panopticon.timedSample(['timedSamplePath', 'timedSampleSubPath'], 'testTimedSample', [0, 1]);
		panopticon.timedSample(['timedSamplePath', 'timedSampleSubPath'], 'testTimedSample', null);
		panopticon.sample([], 'testSample', 0.5);
		panopticon.sample([], 'testSample', null);
	}, 25);

	var threeHalvesTime = setTimeout(function () {
		panopticon.set([], 'testSet', 'someData');
		panopticon.timedSample(['timedSamplePath', 'timedSampleSubPath'], 'testTimedSample', [0, 1]);
		panopticon.timedSample(['timedSamplePath', 'timedSampleSubPath'], 'testTimedSample', [0, 0.5]);
	}, 75);

	panopticon.on('sample', function (data) {
		test.expect(9);

		if (counter !== 1) {
			counter += 1;
			return;
		}

		panopticon.stop();

		clearTimeout(timeOut);
		timeOut = null;
		clearTimeout(halfTime);
		halfTime = null;
		clearTimeout(threeHalvesTime);
		threeHalvesTime = null;

		var expected = {
			testSet: {
				type: 'set',
				value: {
					val: 'someData',
					timeStamp: 0
				}
			},
			incPath: {
				testInc: {
					type: 'inc',
					value: {
						val: 0,
						timeStamp: 0
					}
				}
			},
			timedSamplePath: {
				timedSampleSubPath: {
					testTimedSample: {
						type: 'timedSample',
						value: {
							val: null,
							timeStamp: 0
						}
					}
				}
			},
			testSample: {
				testSample: {
					type: 'sample',
					value: {
						val: null,
						timeStamp: 0
					}
				}
			}
		};

		var actual = seDes(data);

		test.deepEqual(Object.keys(actual), Object.keys(expected));
		test.strictEqual(actual.testSet.type, 'set');
		test.strictEqual(actual.testSet.value.val, 'someData');
		test.strictEqual(actual.incPath.testInc.type, 'inc');
		test.strictEqual(actual.incPath.testInc.value.val, 0);
		test.strictEqual(actual.timedSamplePath.timedSampleSubPath.testTimedSample.type, 'timedSample');
		test.strictEqual(actual.timedSamplePath.timedSampleSubPath.testTimedSample.value.val, undefined);
		test.strictEqual(actual.testSample.type, 'sample');
		test.strictEqual(actual.testSample.value.val, undefined);

		test.done();
	});
};

exports['test worker process panopticon'] = function (test) {
	test.expect(5);

	// Simple way of faking being on a cluster worker.
	cluster.isWorker = true;
	cluster.isMaster = false;

	var messages = 0;
	var id;
	var expected;

	// process.send is not a method on the master process. We can safely monkey patch it.
	process.send = function (message) {
		if (message.event !== 'workerSample') { // Not the droids you're looking for.
			return;
		}

		test.deepEqual(message, expected);

		// Do this test 5 times.
		if (messages < 4) {
			messages += 1;
			return;
		}

		panopticon.stop();

		// Return cluster module to normal.
		cluster.isWorker = false;
		cluster.isMaster = true;

		// The patch is no longer needed, so we remove it.
		delete process.send;

		return test.done();
	};

	var panopticon = new Panopticon(Date.now(), 'testSet', 100, 1, true, null);
	
	id = panopticon.id;

	expected = {
		event: 'workerSample',
		sample: {},
		id: id
	};
};
/*
exports['handle early timeout firing'] = function (test) {
	test.expect(1);

	var panoptica = [];
	var count = 10;

	for (var i = 0; i < count; i++) {
		panoptica.push(new Panopticon(now, i, 1*(i*i), 1, null, null));
	}

	setTimeout(function () {
		panoptica.forEach(function (panopticon) {
			panopticon.stop();
		});
		test.ok(true);
		test.done();
	}, 1000);
};
*/