#!/usr/bin/env node
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

const platforms = {
  'linux-x64':    '@jamestelfer/sandy-linux-x64',
  'linux-arm64':  '@jamestelfer/sandy-linux-arm64',
  'darwin-x64':   '@jamestelfer/sandy-darwin-x64',
  'darwin-arm64': '@jamestelfer/sandy-darwin-arm64',
};

const key = `${process.platform}-${process.arch}`;
const pkg = platforms[key];
if (!pkg) {
  console.error(`sandy: unsupported platform ${key}`);
  process.exit(1);
}

const binaryPath = path.join(
  path.dirname(require.resolve(`${pkg}/package.json`)),
  'sandy'
);

execFileSync(binaryPath, process.argv.slice(2), { stdio: 'inherit' });
