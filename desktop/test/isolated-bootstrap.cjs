'use strict';
// Test runner only; excluded from the shipped build. Keep the real app runtime
// and its sandbox intact, but give tests their own profile and instance lock.
const path = require('node:path');
const { app } = require('electron');
const runtimeRoot = process.env.MOAON_TEST_RUNTIME_ROOT;
const profile = process.env.MOAON_TEST_PROFILE;
if (!runtimeRoot || !profile || !path.isAbsolute(runtimeRoot) || !path.isAbsolute(profile)) {
  throw new Error('Absolute test runtime and profile are required');
}
const originalSetPath = app.setPath.bind(app);
app.setPath = (name, value) => originalSetPath(name, name === 'userData' ? profile : value);
require(path.join(runtimeRoot, 'main.cjs'));
