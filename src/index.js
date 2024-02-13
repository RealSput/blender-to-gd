#!/usr/bin/env node

const cliffhanger = require('@cliffhanger-js/cliffhanger');
const path = require('path');
const packageDir = path.dirname(__filename);
const filePath = path.resolve(packageDir, '..', 'cliffhanger.config.js');
cliffhanger.run(require.resolve(filePath));
